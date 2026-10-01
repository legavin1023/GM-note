<template>
  <div class="admin-scenarios-view">
    <div class="section-heading">
      <div>
        <span class="eyebrow">ADMIN / SCENARIOS</span>
        <h2 class="section-title">시나리오 관리</h2>
      </div>
      <div class="actions">
        <button class="outline-button" @click="handleExportJson">JSON Export (내보내기)</button>
        <router-link to="/admin/scenarios/import" class="primary-button">JSON Import (가져오기)</router-link>
      </div>
    </div>

    <div class="scenarios-manager">
      <div v-for="(scenario, si) in scenarios" :key="scenario.id" class="scenario-admin-card card">
        <div class="sac-head">
          <span class="eyebrow">{{ scenario.code || 'S' + (si + 1) }}</span>
          <input v-model="scenario.title" @change="persistScenario(scenario)" class="form-input title-input" placeholder="시나리오 제목" />
          <input v-model="scenario.code" @change="persistScenario(scenario)" class="form-input code-input" placeholder="코드 (S01)" />
          <input v-model.number="scenario.sort_order" @change="persistScenario(scenario)" type="number" class="form-input sort-input" placeholder="순서" />
        </div>

        <textarea v-model="scenario.description" @change="persistScenario(scenario)" class="form-textarea desc-input" placeholder="시나리오 설명"></textarea>

        <!-- 질문 목록 -->
        <div class="questions-admin">
          <h4>질문 목록 (Questions)</h4>
          <div v-for="(q, qi) in scenario.questions" :key="q.id" class="q-admin-item">
            <div class="q-admin-head">
              <span class="q-badge">Q{{ qi + 1 }}</span>
              <input v-model="q.code" @change="persistScenario(scenario)" class="form-input q-code-input" placeholder="코드 (Q01)" />
              <input v-model="q.prompt" @change="persistScenario(scenario)" class="form-input q-prompt-input" placeholder="질문 내용" />
              <button class="delete-button" title="질문 삭제" @click="removeQuestion(scenario, qi)">×</button>
            </div>

            <!-- 선택지 목록 -->
            <div class="choices-admin">
              <div v-for="(c, ci) in q.choices" :key="c.id" class="c-admin-item">
                <span class="c-badge">선택지 {{ ci + 1 }}</span>
                <input v-model="c.code" @change="persistScenario(scenario)" class="form-input c-code-input" placeholder="A" />
                <input v-model="c.label" @change="persistScenario(scenario)" class="form-input c-label-input" placeholder="선택지 내용" />
                <button class="delete-button" title="선택지 삭제" @click="removeChoice(q, ci)">×</button>
              </div>
              <button class="text-button add-c-btn" @click="addChoice(q)">＋ 선택지 추가</button>
            </div>
          </div>
          <button class="outline-button add-q-btn" @click="addQuestion(scenario)">＋ 질문 추가</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { exportScenariosToJson, saveScenarioDefinition, deleteScenarioQuestion, deleteQuestionChoice } from "@/services/scenarios";

export default {
  name: "AdminScenariosView",
  computed: {
    scenarios() { return this.$store.getters.sortedScenarios; },
    campaignId() { return this.$store.getters.campaignId; },
  },
  methods: {
    async persistScenario(scenario) {
      if (!this.campaignId) return;
      try { scenario.campaign_id = this.campaignId; await saveScenarioDefinition(scenario); }
      catch (error) { this.$store.dispatch("showToast", { message: "Save failed: " + error.message, type: "error" }); }
    },
    addQuestion(scenario) {
      if (!scenario.questions) scenario.questions = [];
      const n = scenario.questions.length + 1;
      scenario.questions.push({ id: "local_" + Date.now(), code: "Q" + String(n).padStart(2, "0"), prompt: "New question", sort_order: n, choices: [
        { id: "local_" + Date.now() + "a", code: "A", label: "Choice A", sort_order: 1 },
        { id: "local_" + Date.now() + "b", code: "B", label: "Choice B", sort_order: 2 },
      ] });
      this.persistScenario(scenario);
    },
    async removeQuestion(scenario, index) {
      const q = scenario.questions[index]; scenario.questions.splice(index, 1);
      if (q.id && !String(q.id).startsWith("local_")) await deleteScenarioQuestion(q.id);
      this.persistScenario(scenario);
    },
    addChoice(question) {
      const n = (question.choices || []).length + 1;
      question.choices.push({ id: "local_" + Date.now(), code: String.fromCharCode(64 + n), label: "Choice " + n, sort_order: n });
      const scenario = this.scenarios.find(s => s.questions.includes(question));
      if (scenario) this.persistScenario(scenario);
    },
    async removeChoice(question, index) {
      const choice = question.choices[index]; question.choices.splice(index, 1);
      if (choice.id && !String(choice.id).startsWith("local_")) await deleteQuestionChoice(choice.id);
      const scenario = this.scenarios.find(s => s.questions.includes(question));
      if (scenario) this.persistScenario(scenario);
    },
    async handleExportJson() {
      if (!this.campaignId) return;
      try {
        const data = await exportScenariosToJson(this.campaignId);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `dragonage-scenarios-${new Date().toISOString().slice(0,10)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.$store.dispatch("showToast", { message: "시나리오 JSON을 내보냈습니다.", type: "success" });
      } catch (error) {
        this.$store.dispatch("showToast", { message: "내보내기 실패: " + error.message, type: "error" });
      }
    },
  },
};
</script>

<style scoped>
/* 관리자 시나리오 목록과 관리 동작 화면에 적용됩니다. */
.admin-scenarios-view { display: flex; flex-direction: column; gap: 24px; }
.actions { display: flex; gap: 10px; }

.scenarios-manager { display: flex; flex-direction: column; gap: 24px; }
.scenario-admin-card { display: flex; flex-direction: column; gap: 16px; }

.sac-head { display: flex; align-items: center; gap: 10px; }
.title-input { font-weight: 700; font-size: 16px; flex: 1; }
.code-input { width: 100px; }
.sort-input { width: 80px; }
.desc-input { min-height: 60px; }

.questions-admin {
  background: var(--paper); border: 1px solid var(--line); border-radius: 4px;
  padding: 16px; display: flex; flex-direction: column; gap: 16px;
}
.questions-admin h4 { margin: 0; font-size: 14px; color: var(--muted); }

.q-admin-item { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.q-admin-head { display: flex; align-items: center; gap: 8px; }
.q-badge { font: 700 12px "DM Mono", monospace; color: var(--accent); }
.q-code-input { width: 90px; }
.q-prompt-input { flex: 1; font-weight: 600; }

.choices-admin { display: flex; flex-direction: column; gap: 6px; padding-left: 20px; border-left: 2px solid var(--line); }
.c-admin-item { display: flex; align-items: center; gap: 8px; }
.c-badge { font-size: 11px; color: var(--muted); width: 60px; }
.c-code-input { width: 60px; font-weight: 700; }
.c-label-input { flex: 1; }

.add-c-btn { align-self: flex-start; margin-top: 4px; }
.add-q-btn { align-self: flex-start; margin-top: 8px; }
</style>
