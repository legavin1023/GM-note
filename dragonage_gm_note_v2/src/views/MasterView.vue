<template>
  <div class="master-view">
    <!-- 상단 요약 카드 -->
    <div class="metric-row">
      <div class="metric-card">
        <span class="eyebrow">TEAMS</span>
        <strong>{{ teams.length }}<small>팀</small></strong>
        <span class="metric-note">등록된 팀</span>
      </div>
      <div class="metric-card">
        <span class="eyebrow">CHARACTERS</span>
        <strong>{{ totalCharacters }}<small>명</small></strong>
        <span class="metric-note">전체 캐릭터</span>
      </div>
      <div class="metric-card">
        <span class="eyebrow">SCENARIOS</span>
        <strong>{{ progressStages.length }}<small>개</small></strong>
        <span class="metric-note">공통 시나리오</span>
      </div>
      <div class="metric-card accent-card">
        <span class="eyebrow">OVERALL</span>
        <strong>{{ overallProgress }}<small>%</small></strong>
        <span class="metric-note">전체 진행률</span>
      </div>
    </div>

    <!-- 팀 진행 현황 -->
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">TEAM PROGRESS</span>
          <h2 class="section-title">팀별 진행 현황</h2>
        </div>
        <router-link to="/teams" class="text-button">팀 관리 →</router-link>
      </div>
      <p v-if="progressError" class="empty-state">팀 진행 기록 조회 실패: {{ progressError }}</p>
      <div class="team-progress-grid">
        <router-link
          v-for="team in sortedTeams"
          :key="team.id"
          :to="'/teams/' + team.id"
          class="team-progress-card"
        >
          <div class="tpc-head">
            <span class="team-dot" :style="{ background: team.color }"></span>
            <b>{{ team.name }}</b>
            <span class="muted">{{ (team.characters || []).length }}명</span>
          </div>
          <div class="tpc-progress">
            <div class="master-team-progress__track">
              <div
                class="master-team-progress__fill"
                :style="{ width: teamProgress(team) + '%' }"
              ></div>
            </div>
            <span class="progress-pct">{{ teamProgress(team) }}%</span>
          </div>
          <div class="tpc-foot">
            <span class="team-progress-stage-title">{{ teamProgressTitle(team) || '진행 시나리오 미정' }}</span>
            <span class="muted">{{ teamProgressDescription(team) || '진행 설명 없음' }}</span>
          </div>
        </router-link>
      </div>
    </section>

    <!-- 마스터 비교표 -->
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">DECISION BOARD</span>
          <h2 class="section-title">시나리오별 선택 비교</h2>
        </div>
        <div class="filter-row">
          <select v-model="filterScenario" class="form-input filter-select">
            <option value="">전체 시나리오</option>
            <option v-for="s in trackerScenarios" :key="s.id" :value="s.id">
              {{ s.code }} {{ s.title }}
            </option>
          </select>
        </div>
      </div>

      <div v-if="!trackerScenarios.length" class="empty-state">
        등록된 시나리오가 없습니다.
        <router-link to="/admin/scenarios/import">JSON 가져오기</router-link>에서
        시나리오를 추가하세요.
      </div>
      <div v-else-if="loadingRecords" class="empty-state">팀별 선택 기록을 불러오는 중…</div>
      <div v-else-if="recordsError || progressError" class="empty-state">서버 기록 조회에 실패했습니다: {{ recordsError || progressError }}</div>
      <div v-else class="decision-wrap">
        <div
          v-for="scenario in filteredScenarios"
          :key="scenario.id"
          class="decision-block"
        >
          <div class="decision-block-head">
            <span class="eyebrow">{{ scenario.code }}</span>
            <h3>{{ scenario.title }}</h3>
            <p class="muted">{{ scenario.description }}</p>
          </div>
          <!-- 비교 테이블 -->
          <div class="compare-table-wrap">
            <table class="compare-table">
              <thead>
                <tr>
                  <th class="q-col">질문</th>
                  <th
                    v-for="team in sortedTeams"
                    :key="team.id"
                    class="team-col"
                  >
                    <span class="team-dot-sm" :style="{ background: team.color }"></span>
                    {{ team.name }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="question in scenario.questions" :key="question.id">
                  <td class="q-col">
                    <span class="q-code">{{ question.code }}</span>
                    <span class="q-prompt">{{ question.prompt }}</span>
                  </td>
                  <td
                    v-for="team in sortedTeams"
                    :key="team.id"
                    class="answer-cell"
                    :title="getAnswerLabel(team, scenario, question)"
                  >
                    <span
                      :class="[
                        'answer-badge',
                        getAnswerCode(team, scenario, question)
                          ? 'answer-badge--set'
                          : 'answer-badge--empty',
                      ]"
                    >
                      {{ getAnswerCode(team, scenario, question) || '—' }}
                    </span>
                  </td>
                </tr>
                <!-- 완료 행 -->
                <tr class="complete-row">
                  <td class="q-col"><span class="q-code">완료</span></td>
                  <td v-for="team in sortedTeams" :key="team.id" class="answer-cell">
                    <span
                      :class="[
                        'badge',
                        isTeamScenarioComplete(team, scenario)
                          ? 'badge-success'
                          : 'badge-muted',
                      ]"
                    >
                      {{ isTeamScenarioComplete(team, scenario) ? '✓ 완료' : '진행 중' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 선택 집계 -->
          <div v-if="scenario.questions.length" class="aggregate-section">
            <span class="eyebrow">AGGREGATE</span>
            <div
              v-for="question in scenario.questions"
              :key="'agg-' + question.id"
              class="agg-block"
            >
              <div class="agg-title">
                {{ question.code }}. {{ question.prompt }}
              </div>
              <div class="agg-bars">
                <div
                  v-for="choice in question.choices"
                  :key="choice.id"
                  class="agg-row"
                >
                  <span class="agg-label">{{ choice.label }}</span>
                  <div class="agg-bar-wrap">
                    <div
                      class="agg-bar-fill"
                      :style="{
                        width: getChoicePercent(scenario, question, choice) + '%',
                      }"
                    ></div>
                  </div>
                  <span class="agg-count">{{ getChoiceCount(scenario, question, choice) }}팀</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 최근 활동 -->
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">RECENT ACTIVITY</span>
          <h2 class="section-title">최근 활동</h2>
        </div>
      </div>
      <div class="activity-list">
        <div
          v-for="item in recentActivity"
          :key="item.key"
          class="activity-item"
        >
          <span class="activity-dot" :style="{ background: item.color }"></span>
          <div>
            <div class="activity-title">{{ item.title }}</div>
            <div class="activity-sub muted">{{ item.sub }}</div>
          </div>
          <span class="activity-time muted">{{ item.time }}</span>
        </div>
        <div v-if="!recentActivity.length" class="empty-state">최근 활동이 없습니다.</div>
      </div>
    </section>
  </div>
</template>

<script>
import { getAllTeamScenariosForScenario } from "@/services/scenarios";
import { getTeamProgressRecords } from "@/services/scenarios";
import { getProgressStageQuestions } from "@/services/scenarios";

export default {
  name: "MasterView",
  data() {
    return {
      filterScenario: "",
      allTeamRecords: {},
      progressRecords: [],
      stageQuestions: [],
      loadingRecords: true,
      recordsError: null,
      progressError: null,
    };
  },
  computed: {
    teams() {
      return this.$store.state.teams;
    },
    sortedTeams() {
      return this.$store.getters.sortedTeams;
    },
    scenarios() {
      return this.$store.getters.sortedScenarios;
    },
    progressStages() {
      return this.$store.state.progressStages;
    },
    trackerScenarios() {
      return this.progressStages.map((stage) => ({
        ...stage,
        id: String(stage.step_number),
        code: `S${String(stage.step_number).padStart(2, "0")}`,
        questions: this.stageQuestions.filter((question) => question.step_number === stage.step_number),
      }));
    },
    filteredScenarios() {
      if (!this.filterScenario) return this.trackerScenarios;
      return this.trackerScenarios.filter((s) => s.id === String(this.filterScenario));
    },
    totalCharacters() {
      return this.teams.reduce((sum, t) => sum + (t.characters || []).length, 0);
    },
    overallProgress() {
      if (!this.teams.length) return 0;
      const total = this.teams.reduce(
        (sum, team) => sum + this.teamProgress(team),
        0
      );
      return Math.round(total / this.teams.length);
    },
    recentActivity() {
      const items = [];
      for (const team of this.teams) {
        for (const char of team.characters || []) {
          if (char.updated_at) {
            items.push({
              key: "char-" + char.id,
              title: `캐릭터 "${char.username || '이름 없음'}" 수정`,
              sub: team.name,
              time: this.formatTime(char.updated_at),
              color: team.color,
              ts: new Date(char.updated_at).getTime(),
            });
          }
        }
      }
      for (const scenarioId in this.allTeamRecords) {
        for (const record of this.allTeamRecords[scenarioId] || []) {
          if (record.updated_at) {
            const team = this.teams.find((t) => t.id === record.team_id);
            const scenario = this.scenarios.find((s) => s.id === scenarioId);
            items.push({
              key: "ts-" + record.id,
              title: `${scenario?.code || ''} 시나리오 기록 업데이트`,
              sub: team?.name || "",
              time: this.formatTime(record.updated_at),
              color: team?.color || "#8b7aa8",
              ts: new Date(record.updated_at).getTime(),
            });
          }
        }
      }
      return items.sort((a, b) => b.ts - a.ts).slice(0, 10);
    },
  },
  async mounted() {
    await this.loadAllRecords();
    this.recordsChannel = this.$supabase
      .channel("master-team-scenario-records")
      .on("postgres_changes", { event: "*", schema: "public", table: "team_scenarios" }, this.loadAllRecords)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_scenario_answers" }, this.loadAllRecords)
      .subscribe();
  },
  beforeUnmount() {
    if (this.recordsChannel) this.$supabase.removeChannel(this.recordsChannel);
  },
  watch: {
    scenarios() {
      this.loadAllRecords();
    },
    progressStages() {
      this.loadAllRecords();
    },
    teams() {
      this.loadAllRecords();
    },
  },
  methods: {
    async loadAllRecords() {
      this.loadingRecords = true;
      this.recordsError = null;
      this.progressError = null;
      try {
        this.stageQuestions = await getProgressStageQuestions();
        console.info("[Supabase] progress stage questions:", this.stageQuestions.length);
      } catch (error) {
        this.stageQuestions = [];
        this.progressError = error.message || String(error);
        console.error("[Supabase] PROGRESS STAGE QUESTIONS ERROR", error);
      }
      try {
        const results = await Promise.all(this.scenarios.map((scenario) => getAllTeamScenariosForScenario(scenario.id)));
        const records = {};
        this.scenarios.forEach((scenario, index) => { records[scenario.id] = results[index]; });
        this.allTeamRecords = records;
      } catch (error) {
        this.allTeamRecords = {};
        this.recordsError = error.message || String(error);
      }
      try {
        this.progressRecords = await getTeamProgressRecords(this.teams.map((team) => team.id));
        console.info("[Supabase] team progress records:", this.progressRecords.length);
      } catch (error) {
        this.progressRecords = [];
        this.progressError = error.message || String(error);
        console.error("[Supabase] TEAM PROGRESS RECORDS ERROR", error);
      }
      this.loadingRecords = false;
    },
    teamProgress(team) {
      const total = this.progressStages.length || this.scenarios.length;
      if (!total) return 0;
      return Math.min(Math.round((this.teamProgressStep(team) / total) * 100), 100);
    },
    teamProgressStep(team) {
      const step = Number(team.progress_step);
      return Number.isFinite(step) && step >= 1 ? step : 1;
    },
    teamProgressDescription(team) {
      const stage = this.progressStages.find(
        (item) => Number(item.step_number) === this.teamProgressStep(team)
      );
      return stage?.description || "";
    },
    teamProgressTitle(team) {
      const stage = this.progressStages.find(
        (item) => Number(item.step_number) === this.teamProgressStep(team)
      );
      return stage?.title || "";
    },
    getTeamRecord(team, scenario) {
      if (scenario.step_number != null) {
        return this.progressRecords.find((record) =>
          record.team_id === team.id && record.step_number === scenario.step_number
        ) || null;
      }
      const records = this.allTeamRecords[scenario.id] || [];
      return records.find((r) => r.team_id === team.id) || null;
    },
    isTeamScenarioComplete(team, scenario) {
      return this.getTeamRecord(team, scenario)?.completed || false;
    },
    getAnswerCode(team, scenario, question) {
      const record = this.getTeamRecord(team, scenario);
      if (!record) return null;
      const answer = (record.team_scenario_answers || []).find(
        (a) => a.question_id === question.id
      );
      if (!answer) return null;
      const choice = question.choices.find((c) => c.id === answer.choice_id);
      return choice?.code || null;
    },
    getAnswerLabel(team, scenario, question) {
      const record = this.getTeamRecord(team, scenario);
      if (!record) return "미선택";
      const answer = (record.team_scenario_answers || []).find(
        (a) => a.question_id === question.id
      );
      if (!answer) return "미선택";
      const choice = question.choices.find((c) => c.id === answer.choice_id);
      return choice?.label || "미선택";
    },
    getChoiceCount(scenario, question, choice) {
      const records = this.progressRecords.filter((record) => record.step_number === Number(scenario.id));
      return records.filter((r) =>
        (r.team_scenario_answers || []).some(
          (a) => a.question_id === question.id && a.choice_id === choice.id
        )
      ).length;
    },
    getChoicePercent(scenario, question, choice) {
      const total = this.teams.length;
      if (!total) return 0;
      return Math.round((this.getChoiceCount(scenario, question, choice) / total) * 100);
    },
    formatTime(isoStr) {
      if (!isoStr) return "";
      const d = new Date(isoStr);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60) return "방금 전";
      if (diff < 3600) return Math.floor(diff / 60) + "분 전";
      if (diff < 86400) return Math.floor(diff / 3600) + "시간 전";
      return d.toLocaleDateString("ko-KR");
    },
  },
};
</script>

<style scoped>
/* GM 메인 대시보드의 요약 카드와 진행 현황에 적용됩니다. */
.master-view { display: flex; flex-direction: column; gap: 32px; }
.metric-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.metric-card {
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 20px;
  border-radius: 4px;
}
.metric-card strong {
  display: block;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.04em;
  margin: 8px 0 4px;
  line-height: 1;
}
.metric-card strong small {
  font-size: 14px;
  font-weight: 600;
  margin-left: 4px;
  opacity: 0.6;
}
.metric-card .metric-note { font-size: 12px; color: var(--muted); }
.accent-card { border-color: var(--accent); }
.accent-card strong { color: var(--accent); }

.section-block {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 24px;
}

.team-progress-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.team-progress-card {
  display: block;
  background: var(--paper);
  border: 1px solid var(--line);
  padding: 16px;
  border-radius: 4px;
  text-decoration: none;
  color: var(--ink);
  transition: border-color 0.15s, transform 0.1s;
}
.team-progress-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.tpc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.tpc-head b { flex: 1; font-size: 14px; }
.team-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.tpc-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.master-team-progress__track {
  display: block;
  flex: 1 1 auto;
  min-width: 80px;
  height: 8px;
  background: var(--line);
  border-radius: 999px;
  overflow: hidden;
}
.master-team-progress__fill {
  display: block;
  background: var(--accent);
  height: 100%;
  border-radius: inherit;
  transition: width 0.3s ease;
}
.progress-pct { font-size: 13px; font-weight: 700; min-width: 36px; text-align: right; }
.tpc-foot { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.team-progress-stage-title { color: var(--ink); font-weight: 600; }

.filter-row { display: flex; gap: 8px; }
.filter-select { font-size: 13px; padding: 7px 12px; min-width: 200px; }

.decision-wrap { display: flex; flex-direction: column; gap: 32px; }
.decision-block { }
.decision-block-head { margin-bottom: 12px; }
.decision-block-head h3 { font-size: 16px; font-weight: 700; margin: 4px 0 0; }

.compare-table-wrap { overflow-x: auto; }
.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 500px;
}
.compare-table th, .compare-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}
.compare-table th { background: var(--paper); font-weight: 600; font-size: 12px; }
.q-col { min-width: 200px; max-width: 280px; }
.team-col { min-width: 90px; font-size: 12px; }
.q-code { display: inline-block; font: 600 10px "DM Mono",monospace; background: var(--line); padding: 2px 6px; border-radius: 2px; margin-right: 6px; color: var(--muted); }
.q-prompt { font-size: 13px; }
.answer-cell { text-align: center; }
.answer-badge {
  display: inline-block;
  font: 700 11px "DM Mono",monospace;
  padding: 3px 8px;
  border-radius: 2px;
  min-width: 28px;
  text-align: center;
}
.answer-badge--set { background: rgba(201,121,84,0.15); color: var(--accent); }
.answer-badge--empty { background: var(--line); color: var(--muted); }
.complete-row td { background: var(--paper); }
.team-dot-sm {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.aggregate-section { margin-top: 20px; }
.agg-block { margin-top: 12px; }
.agg-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.agg-bars { display: flex; flex-direction: column; gap: 6px; }
.agg-row { display: flex; align-items: center; gap: 10px; }
.agg-label { font-size: 13px; min-width: 120px; }
.agg-bar-wrap { flex: 1; background: var(--line); height: 8px; border-radius: 4px; overflow: hidden; }
.agg-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.3s; }
.agg-count { font-size: 12px; color: var(--muted); min-width: 32px; text-align: right; }

.activity-list { display: flex; flex-direction: column; gap: 12px; }
.activity-item { display: flex; align-items: flex-start; gap: 12px; }
.activity-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 6px; }
.activity-title { font-size: 14px; font-weight: 600; }
.activity-sub { font-size: 12px; }
.activity-time { margin-left: auto; font-size: 12px; flex-shrink: 0; }

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}
.empty-state a { color: var(--accent); }

@media (max-width: 900px) {
  .metric-row { grid-template-columns: repeat(2, 1fr); }
  .compare-table th, .compare-table td { padding: 8px; }
}
@media (max-width: 600px) {
  .metric-row { grid-template-columns: 1fr 1fr; }
}
</style>
