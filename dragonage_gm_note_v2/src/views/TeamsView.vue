<template>
  <div class="teams-view">
    <div class="section-heading">
      <div>
        <span class="eyebrow">PARTY ROSTER</span>
        <h2 class="section-title">팀 목록</h2>
      </div>
      <button class="primary-button" @click="showAddTeam = true">
        ＋ 팀 추가
      </button>
    </div>

    <p v-if="progressError" class="empty-state">
      팀 진행 데이터를 불러오지 못했습니다: {{ progressError }}
    </p>
    <p v-else-if="progressLoading" class="muted">팀 진행 상황을 불러오는 중…</p>
    <div class="team-grid">
      <router-link
        v-for="team in sortedTeams"
        :key="team.id"
        :to="'/teams/' + team.id"
        class="team-card"
      >
        <div class="team-card-color" :style="{ background: team.color }"></div>
        <div class="team-card-body">
          <div class="team-card-head">
            <div
              class="team-symbol"
              :style="{ background: team.color }"
              :aria-label="team.name + ' 팀 색상'"
              role="img"
            ></div>
            <div>
              <h3>{{ team.name }}</h3>
              <span class="muted">{{ team.region || "지역 미정" }}</span>
            </div>
          </div>
          <p class="team-desc muted">{{ team.description || "설명 없음" }}</p>
          <div class="team-progress-row">
            <div class="progress-bar">
              <div
                class="progress-bar-fill"
                :style="{
                  width: teamProgress(team) + '%',
                  background: team.color,
                }"
              ></div>
            </div>
            <span class="muted" style="font-size: 12px"
              >{{ teamProgress(team) }}%</span
            >
          </div>
          <div class="team-chars">
            <div
              v-for="char in (team.characters || []).slice(0, 4)"
              :key="char.id"
              class="char-token"
              :title="char.character_name"
            >
              <img
                v-if="char.token_url"
                :src="char.token_url"
                :alt="char.character_name"
              />
              <span v-else>{{ (char.character_name || "?")[0] }}</span>
            </div>
            <div
              v-if="(team.characters || []).length > 4"
              class="char-token char-token-more"
            >
              +{{ (team.characters || []).length - 4 }}
            </div>
          </div>
        </div>
      </router-link>
    </div>

    <div v-if="!sortedTeams.length" class="empty-state">
      등록된 팀이 없습니다. 팀을 추가하세요.
    </div>

    <!-- 팀 추가 모달 -->
    <div
      v-if="showAddTeam"
      class="modal-overlay"
      @click.self="showAddTeam = false"
    >
      <div class="modal">
        <div class="modal-head">
          <h3>팀 추가</h3>
          <button class="delete-button" @click="showAddTeam = false">×</button>
        </div>
        <div class="modal-body">
          <label class="form-label"
            >팀 이름 <input v-model="newTeam.name" class="form-input" required
          /></label>
          <label class="form-label"
            >지역 <input v-model="newTeam.region" class="form-input"
          /></label>
          <label class="form-label"
            >설명
            <textarea
              v-model="newTeam.description"
              class="form-textarea"
            ></textarea>
          </label>
          <label class="form-label">
            색상
            <div class="color-row">
              <input
                v-model="newTeam.color"
                type="color"
                class="color-picker"
              />
              <span>{{ newTeam.color }}</span>
            </div>
          </label>
        </div>
        <div class="modal-foot">
          <button class="secondary-button" @click="showAddTeam = false">
            취소
          </button>
          <button
            class="primary-button"
            :disabled="saving"
            @click="handleAddTeam"
          >
            {{ saving ? "추가 중..." : "팀 추가" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { createTeam } from "@/services/teams";

export default {
  name: "TeamsView",
  data() {
    return {
      showAddTeam: false,
      saving: false,
      progressLoading: false,
      progressError: null,
      newTeam: { name: "", region: "", description: "", color: "#b42332" },
    };
  },
  computed: {
    sortedTeams() {
      return this.$store.getters.sortedTeams;
    },
    scenarios() {
      return this.$store.getters.sortedScenarios;
    },
    progressStages() {
      return this.$store.state.progressStages;
    },
  },
  methods: {
    teamProgress(team) {
      const total = this.progressStages.length || this.scenarios.length;
      if (!total) return 0;
      const step = Number(team.progress_step) || 1;
      return Math.min(Math.round((step / total) * 100), 100);
    },
    async handleAddTeam() {
      if (!this.newTeam.name.trim()) return;
      this.saving = true;
      try {
        const campaignId = this.$store.getters.campaignId;
        const newT = await createTeam(campaignId, {
          ...this.newTeam,
          sort_order: this.sortedTeams.length,
        });
        this.$store.commit("addTeam", newT);
        this.$store.dispatch("showToast", {
          message: "팀이 추가되었습니다.",
          type: "success",
        });
        this.showAddTeam = false;
        this.newTeam = {
          name: "",
          region: "",
          description: "",
          color: "#b42332",
        };
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "팀 추가 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
/* 팀 목록과 팀 생성 폼 및 팀 카드에 적용됩니다. */
.teams-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.team-card {
  display: block;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  overflow: hidden;
  text-decoration: none;
  color: var(--ink);
  transition: border-color 0.15s, transform 0.1s;
}
.team-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.team-card-color {
  height: 4px;
}
.team-card-body {
  padding: 20px;
}
.team-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.team-symbol {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: #fff;
  font-weight: 800;
  font-size: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}
.team-card-head h3 {
  margin: 0 0 2px;
  font-size: 16px;
}
.team-desc {
  font-size: 13px;
  margin: 0 0 14px;
  line-height: 1.5;
}
.team-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}
.team-progress-row .progress-bar {
  flex: 1;
}
.team-chars {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.char-token {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}
.char-token img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.char-token-more {
  background: var(--line);
  color: var(--muted);
  font-size: 11px;
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--muted);
}

/* 모달 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  width: 100%;
  max-width: 480px;
  padding: 0;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--line);
}
.modal-head h3 {
  margin: 0;
  font-size: 18px;
}
.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-foot {
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.color-picker {
  width: 48px;
  height: 36px;
  border: none;
  cursor: pointer;
  padding: 0;
}

@media (max-width: 600px) {
  .team-grid {
    grid-template-columns: 1fr;
  }
}
</style>
