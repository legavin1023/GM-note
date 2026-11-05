<template>
  <div class="push-settings">
    <details :open="!subscribed">
      <summary>알림 설정</summary>
      <fieldset :disabled="busy || Boolean(environment)" @change="dirty = true">
        <legend>받을 알림</legend>
        <label
          ><input v-model="preferences.receive_new_posts" type="checkbox" /> 새
          글 알림</label
        >
        <label
          ><input v-model="preferences.receive_own_comments" type="checkbox" />
          내 글에 달린 댓글 알림</label
        >
        <p>다른 사람이 내 글에 남긴 댓글을 알려줍니다.</p>
        <label
          ><input v-model="preferences.receive_notices" type="checkbox" /> 새
          공지 알림</label
        >
        <label
          ><input
            v-model="preferences.receive_session_reminders"
            type="checkbox"
          />
          세션 시작 10분 전 알림</label
        >
        <label v-if="isMaster"
          ><input v-model="preferences.receive_activity" type="checkbox" />
          최근활동 알림 (마스터 전용)</label
        >
        <p>
          공지는 모든 팀에 공통입니다. 세션은 선택한 팀 중 열람 가능한 팀의
          일정만 알려줍니다.
        </p>
      </fieldset>
      <fieldset :disabled="busy || Boolean(environment)" @change="dirty = true">
        <legend>알림을 받을 팀</legend>
        <label
          ><input v-model="preferences.all_teams" type="radio" :value="true" />
          전체 팀 · 마스터 작품</label
        >
        <label
          ><input v-model="preferences.all_teams" type="radio" :value="false" />
          선택한 팀만</label
        >
        <div v-if="!preferences.all_teams" class="push-team-options">
          <label v-for="team in teams" :key="team.id"
            ><input
              v-model="preferences.team_ids"
              type="checkbox"
              :value="team.id"
            />
            {{ team.name }}</label
          >
          <label
            ><input
              v-model="preferences.include_master_artwork"
              type="checkbox"
            />
            마스터 작품</label
          >
          <p v-if="!hasTeamSelection">
            알림을 받을 팀이나 마스터 작품을 하나 이상 선택하세요.
          </p>
        </div>
        <p>
          팀 선택은 새 글, 댓글, 세션 알림에 적용됩니다. 설정은 이 기기에
          저장됩니다.
        </p>
      </fieldset>
      <button
        v-if="subscribed"
        type="button"
        class="push-button"
        :disabled="
          busy || !dirty || !hasValidTeamSelection || Boolean(environment)
        "
        @click="save"
      >
        설정 저장
      </button>
    </details>
    <button
      type="button"
      class="push-button"
      :disabled="
        busy ||
        Boolean(environment) ||
        blocked ||
        (!subscribed && (!hasValidTeamSelection || !hasNotificationType))
      "
      @click="enable"
    >
      {{ subscriptionLabel }}
    </button>
    <button
      v-if="deviceSubscription"
      type="button"
      class="push-button"
      :disabled="busy"
      @click="disable"
    >
      알림 해제
    </button>
    <p role="status" aria-live="polite">
      {{
        message ||
        environment ||
        (blocked
          ? "알림이 차단되었습니다. 브라우저/휴대폰 설정에서 알림을 허용하세요."
          : "신청하면 사이트를 닫아도 선택한 알림을 이 기기에서 받습니다.")
      }}
    </p>
  </div>
</template>
<script>
import {
  pushEnvironmentMessage,
  currentPushState,
  subscribeToPosts,
  unsubscribeFromPosts,
  defaultPushPreferences,
  savePushPreferences,
} from "@/services/push";
export default {
  props: { teams: { type: Array, default: () => [] } },
  data: () => ({
    busy: false,
    subscribed: false,
    deviceSubscription: false,
    environment: "",
    blocked: false,
    message: "",
    preferences: defaultPushPreferences(),
    savedPreferences: defaultPushPreferences(),
    dirty: false,
  }),
  computed: {
    isMaster() {
      return (
        this.$store.getters.isMaster && !this.$store.getters.isPlayerPreview
      );
    },
    hasValidTeamSelection() {
      return (
        (!(
          this.preferences.receive_new_posts ||
          this.preferences.receive_own_comments
        ) ||
          this.hasTeamSelection) &&
        (!this.preferences.receive_session_reminders ||
          this.preferences.all_teams ||
          this.preferences.team_ids.length > 0)
      );
    },
    hasTeamSelection() {
      return (
        this.preferences.all_teams ||
        this.preferences.team_ids.length > 0 ||
        this.preferences.include_master_artwork
      );
    },
    hasNotificationType() {
      return (
        this.preferences.receive_new_posts ||
        this.preferences.receive_own_comments ||
        this.preferences.receive_notices ||
        this.preferences.receive_session_reminders ||
        (this.isMaster && this.preferences.receive_activity)
      );
    },
    subscriptionLabel() {
      if (!this.subscribed) return "🔔 새 글 알림 받기";
      if (
        this.savedPreferences.receive_notices ||
        this.savedPreferences.receive_session_reminders ||
        (this.isMaster && this.savedPreferences.receive_activity)
      )
        return "🔔 알림 받는 중";
      if (this.savedPreferences.receive_new_posts)
        return "🔔 새 글 알림 받는 중";
      return this.savedPreferences.receive_own_comments
        ? "🔔 댓글 알림 받는 중"
        : "🔕 알림 일시중지 중";
    },
  },
  mounted() {
    this.refresh();
    window.addEventListener("focus", this.refresh);
  },
  beforeUnmount() {
    window.removeEventListener("focus", this.refresh);
  },
  methods: {
    async refresh() {
      this.environment = pushEnvironmentMessage();
      this.blocked =
        "Notification" in window && Notification.permission === "denied";
      if (this.environment || this.busy) return;
      try {
        const state = await currentPushState();
        this.subscribed = state.subscribed;
        this.deviceSubscription = state.deviceSubscription;
        if (state.preferences) {
          this.savedPreferences = state.preferences;
          if (!this.dirty)
            this.preferences = {
              ...state.preferences,
              team_ids: [...state.preferences.team_ids],
            };
        }
      } catch (error) {
        this.message = error.message;
      }
    },
    async enable() {
      if (this.subscribed) return;
      this.busy = true;
      this.message = "";
      try {
        await subscribeToPosts(this.preferences);
        this.dirty = false;
        this.message = "선택한 설정으로 이 기기의 알림을 신청했습니다.";
      } catch (error) {
        this.message = error.message;
      } finally {
        this.busy = false;
        await this.refresh();
      }
    },
    async save() {
      this.busy = true;
      try {
        await savePushPreferences(this.preferences);
        this.dirty = false;
        this.message = "알림 설정을 저장했습니다.";
      } catch (error) {
        this.message = error.message;
      } finally {
        this.busy = false;
        await this.refresh();
      }
    },
    async disable() {
      this.busy = true;
      try {
        await unsubscribeFromPosts();
        this.dirty = false;
        this.message = "이 기기의 새 글 알림을 해제했습니다.";
      } catch (error) {
        this.message = error.message;
      } finally {
        this.busy = false;
        await this.refresh();
      }
    },
  },
};
</script>
<style scoped>
.push-settings {
  margin: 12px 0 20px;
}
.push-settings details {
  margin-bottom: 12px;
}
.push-settings summary {
  cursor: pointer;
  font-weight: 600;
}
.push-settings fieldset {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--line, #ddd);
  border-radius: 8px;
}
.push-settings label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 6px 16px 6px 0;
}
.push-settings input {
  accent-color: var(--accent, #9f4a4a);
}
.push-team-options {
  display: flex;
  flex-wrap: wrap;
}
.push-team-options p {
  width: 100%;
}
.push-button {
  padding: 9px 13px;
  margin: 0 8px 6px 0;
  border: 1px solid var(--line, #ddd);
  border-radius: 8px;
  background: var(--surface, #fff);
  color: var(--text, #333);
  font: inherit;
  cursor: pointer;
}
.push-button:disabled {
  opacity: 0.6;
  cursor: default;
}
.push-settings p {
  margin: 4px 0;
  font-size: 12px;
  color: var(--muted, #777);
  line-height: 1.6;
}
</style>
