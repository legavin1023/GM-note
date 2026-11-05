<template>
  <section class="section-block">
    <div class="section-heading">
      <div>
        <span class="eyebrow">RECENT ACTIVITY</span>
        <h2 class="section-title">최근활동</h2>
      </div>
      <button class="text-button" :disabled="loading" @click="load">
        새로고침
      </button>
    </div>
    <p v-if="error" class="empty-state" role="alert">{{ error }}</p>
    <p v-if="loading && !logs.length" class="empty-state">
      최근활동을 불러오는 중…
    </p>
    <p v-else-if="!logs.length" class="empty-state">최근활동이 없습니다.</p>
    <div v-for="log in logs" :key="log.id" class="activity-row">
      <div>
        <strong>{{ log.feature }} {{ operation(log.operation) }}</strong>
        <p class="muted">
          {{ log.actor_label }} · {{ log.entity_label || "변경 기록"
          }}{{ teamName(log.team_id) ? " · " + teamName(log.team_id) : "" }}
        </p>
        <ul v-if="detailLines(log).length" class="activity-details">
          <li v-for="(line, index) in detailLines(log)" :key="index">
            {{ line }}
          </li>
        </ul>
      </div>
      <span class="badge">{{
        log.actor_type === "master" ? "마스터 작업" : "플레이어 작업"
      }}</span
      ><time class="muted">{{ formatTime(log.created_at) }}</time>
    </div>
    <button
      v-if="hasMore"
      class="outline-button"
      :disabled="loading"
      @click="load(true)"
    >
      이전 활동 더 보기
    </button>
  </section>
</template>
<script>
import { supabase } from "@/supabase";
import { activityDetailLines } from "@/services/activityDetails.mjs";
export default {
  data: () => ({
    logs: [],
    loading: false,
    error: "",
    hasMore: false,
    channel: null,
  }),
  mounted() {
    this.load();
    this.channel = supabase
      .channel(`activity-page-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_activity_logs" },
        () => this.load()
      )
      .subscribe();
  },
  beforeUnmount() {
    if (this.channel) supabase.removeChannel(this.channel);
  },
  watch: {
    "$store.state.gmPlayerPreviewMode"(enabled) {
      if (enabled) this.$router.replace("/home");
    },
  },
  methods: {
    detailLines: activityDetailLines,
    async load(more = false) {
      if (this.loading) return;
      this.loading = true;
      this.error = "";
      try {
        let q = supabase
          .from("app_activity_logs")
          .select("*")
          .order("id", { ascending: false })
          .limit(50);
        if (more === true && this.logs.length)
          q = q.lt("id", this.logs[this.logs.length - 1].id);
        const { data, error } = await q;
        if (error) throw error;
        this.logs = more === true ? [...this.logs, ...data] : data;
        this.hasMore = data.length === 50;
      } catch (e) {
        this.error = `최근활동을 불러오지 못했습니다: ${e.message}`;
      } finally {
        this.loading = false;
      }
    },
    teamName(id) {
      return this.$store.state.teams.find((t) => t.id === id)?.name || "";
    },
    operation(value) {
      return (
        { INSERT: "등록", UPDATE: "수정", DELETE: "삭제" }[value] || "변경"
      );
    },
    formatTime(value) {
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value));
    },
  },
};
</script>
<style scoped>
.activity-details {
  padding-left: 20px;
  margin: 8px 0;
  font-size: 13px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.activity-details li + li {
  margin-top: 5px;
}
.activity-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
.activity-row > div {
  flex: 1;
  min-width: 0;
}
.activity-row p {
  margin: 6px 0;
  overflow-wrap: anywhere;
}
time {
  white-space: nowrap;
}
.outline-button {
  margin-top: 20px;
}
@media (max-width: 640px) {
  .activity-row {
    flex-wrap: wrap;
  }
  .activity-row > div {
    flex-basis: 100%;
  }
}
</style>
