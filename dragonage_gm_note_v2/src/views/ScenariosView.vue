<template>
  <div class="scenarios-view">
    <div class="section-heading">
      <div>
        <span class="eyebrow">SHARED SCENARIO LOG</span>
        <h2 class="section-title">시나리오 트래커</h2>
      </div>
      <router-link to="/admin/scenarios" class="outline-button"
        >시나리오 관리</router-link
      >
    </div>

    <div v-if="!scenarios.length" class="empty-state">
      등록된 시나리오가 없습니다.
      <router-link to="/admin/scenarios/import">JSON 가져오기</router-link>에서
      시나리오를 추가하세요.
    </div>

    <div v-else-if="recordsError" class="empty-state">팀별 서버 기록 조회 실패: {{ recordsError }}</div>
    <div v-else class="scenarios-layout">
      <!-- 시나리오 목록 -->
      <div class="scenario-list">
        <button
          v-for="(scenario, index) in scenarios"
          :key="scenario.id"
          :class="['scenario-item', { selected: selectedId === scenario.id }]"
          @click="selectScenario(scenario)"
        >
          <span class="scenario-number">{{ index + 1 }}</span>
          <div class="scenario-info">
            <span class="scenario-name">{{ scenario.title }}</span>
            <span class="scenario-description muted">{{ scenario.description || '설명이 없습니다.' }}</span>
            <span class="muted"
              >{{ (scenario.questions || []).length }}개 질문</span
            >
          </div>
          <span class="scenario-code">{{ scenario.code }}</span>
          <span class="scenario-arrow">›</span>
        </button>
      </div>

      <!-- 시나리오 상세 -->
      <div v-if="selected" class="scenario-detail">
        <div class="detail-header">
          <span class="eyebrow">{{ selected.code }}</span>
          <h2>{{ selected.title }}</h2>
          <p class="muted">{{ selected.description }}</p>
          <router-link
            :to="'/scenarios/' + selected.id"
            class="primary-button"
            style="display: inline-block; margin-top: 12px"
          >
            팀별 플레이 기록 작성 / 편집 →
          </router-link>
        </div>

        <div class="questions-block">
          <p v-if="stageQuestionsError" class="empty-state">단계 질문을 불러오지 못했습니다: {{ stageQuestionsError }}</p>
          <div class="section-heading">
            <span class="eyebrow">QUESTIONS</span>
          </div>
          <div
            v-for="(question, qi) in selected.questions || []"
            :key="question.id"
            class="question-card"
          >
            <div class="question-head">
              <span class="q-num">Q{{ qi + 1 }}</span>
              <span>{{ question.prompt }}</span>
              <span v-if="question.code" class="code-badge">{{
                question.code
              }}</span>
            </div>
            <div class="choices">
              <span
                v-for="choice in question.choices || []"
                :key="choice.id"
                class="choice-chip"
              >
                <span class="choice-code">{{ choice.code }}</span>
                {{ choice.label }}
                <span class="choice-team-markers" aria-label="선택한 팀">
                  <span
                    v-for="team in teamsForChoice(question.id, choice.id)"
                    :key="team.id"
                    class="choice-team-dot"
                    :style="{ backgroundColor: team.color || '#999' }"
                    :title="team.name"
                    :aria-label="team.name"
                    role="img"
                  ></span>
                </span>
              </span>
            </div>
          </div>
          <div v-if="!(selected.questions || []).length" class="empty-state">
            질문이 없습니다.
          </div>
        </div>

        <!-- 팀별 완료 현황 요약 -->
        <div class="team-status-block">
          <div class="section-heading">
            <span class="eyebrow">TEAM STATUS</span>
          </div>
          <div class="team-status-grid">
            <div
              v-for="team in sortedTeams"
              :key="team.id"
              class="team-status-item"
            >
              <span class="team-dot" :style="{ background: team.color }"></span>
              <span>{{ team.name }}</span>
              <span
                :class="[
                  'badge',
                  teamRecords[team.id]?.completed
                    ? 'badge-success'
                    : 'badge-muted',
                ]"
              >
                {{ teamRecords[team.id]?.completed ? "완료" : "진행 중" }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="no-selection">
        <p class="muted">시나리오를 선택하면 상세 내용을 확인합니다.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { getProgressStageQuestions, getTeamProgressRecords } from "@/services/scenarios";

export default {
  name: "ScenariosView",
  data() {
    return {
      selectedId: null,
      teamRecords: {},
      recordsError: null,
      stageQuestions: [],
      stageQuestionsError: null,
    };
  },
  computed: {
    scenarios() {
      return this.$store.state.progressStages.map((stage) => ({
        ...stage,
        id: String(stage.step_number),
        code: `S${String(stage.step_number).padStart(2, "0")}`,
        questions: this.stageQuestions.filter((question) => question.step_number === stage.step_number),
      }));
    },
    sortedTeams() {
      return this.$store.getters.sortedTeams;
    },
    selected() {
      return this.scenarios.find((s) => s.id === String(this.selectedId)) || null;
    },
  },
  watch: {
    scenarios(val) {
      if (val.length && !this.selectedId) this.selectScenario(val[0]);
    },
  },
  mounted() {
    this.loadStageQuestions();
    if (this.scenarios.length) this.selectScenario(this.scenarios[0]);
  },
  methods: {
    teamsForChoice(questionId, choiceId) {
      return this.sortedTeams.filter((team) => {
        const answers = this.teamRecords[team.id]?.team_scenario_answers || [];
        return answers.some(
          (answer) => answer.question_id === questionId && answer.choice_id === choiceId
        );
      });
    },
    async loadStageQuestions() {
      try {
        this.stageQuestions = await getProgressStageQuestions();
      } catch (error) {
        this.stageQuestionsError = error.message || String(error);
      }
    },
    async selectScenario(scenario) {
      this.selectedId = scenario.id;
      this.recordsError = null;
      try {
        const records = await getTeamProgressRecords(this.sortedTeams.map((team) => team.id));
        const map = {};
        for (const r of records) {
          if (r.step_number === scenario.step_number) map[r.team_id] = r;
        }
        this.teamRecords = map;
      } catch (error) {
        this.teamRecords = {};
        this.recordsError = error.message || String(error);
      }
    },
  },
};
</script>

<style scoped>
/* 시나리오 목록과 검색 및 필터 화면에 적용됩니다. */
.scenarios-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.scenarios-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 20px;
  align-items: start;
}
.scenario-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.scenario-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  text-align: left;
  color: var(--ink);
  transition: all 0.1s;
}
.scenario-item:hover {
  border-color: var(--accent);
}
.scenario-item.selected {
  border-color: var(--accent);
  background: rgba(201, 121, 84, 0.05);
}
.scenario-number {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font: 700 12px "DM Mono", monospace;
  flex-shrink: 0;
}
.scenario-code {
  font: 700 11px "DM Mono", monospace;
  background: var(--line);
  padding: 3px 7px;
  border-radius: 2px;
  color: var(--muted);
  flex-shrink: 0;
}
.scenario-info {
  flex: 1;
}
.scenario-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
}
.scenario-description {
  display: block;
  margin: 2px 0 4px;
  font-size: 12px;
  line-height: 1.45;
}
.scenario-arrow {
  color: var(--muted);
}

.scenario-detail {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 24px;
}
.detail-header {
  margin-bottom: 24px;
}
.detail-header h2 {
  margin: 4px 0 8px;
}

.questions-block {
  margin-bottom: 24px;
}
.question-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 14px 16px;
  margin-bottom: 10px;
}
.question-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  font-weight: 600;
}
.q-num {
  font: 700 11px "DM Mono", monospace;
  color: var(--accent);
}
.code-badge {
  margin-left: auto;
  font: 600 10px "DM Mono", monospace;
  background: var(--line);
  padding: 2px 6px;
  border-radius: 2px;
  color: var(--muted);
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.choice-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 13px;
}
.choice-code {
  font: 700 10px "DM Mono", monospace;
  color: var(--accent);
}
.choice-team-markers {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 2px;
}
.choice-team-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 50%;
  flex: 0 0 10px;
  cursor: help;
}

.team-status-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.team-status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 4px;
}
.team-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.team-status-item span:nth-child(2) {
  flex: 1;
  font-weight: 600;
}

.no-selection {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 48px;
  text-align: center;
}
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--muted);
}
.empty-state a {
  color: var(--accent);
}

@media (max-width: 768px) {
  .scenarios-layout {
    grid-template-columns: 1fr;
  }
}
</style>
