<template>
  <div v-if="scenario" class="scenario-detail-view">
    <div class="section-heading">
      <div>
        <span class="eyebrow">{{ scenario.code }}</span>
        <h2 class="section-title">{{ scenario.title }}</h2>
        <p class="muted">{{ scenario.description }}</p>
      </div>
      <div class="header-actions">
        <router-link to="/scenarios" class="outline-button"
          >← 목록으로</router-link
        >
      </div>
    </div>

    <!-- 팀 선택 탭 -->
    <form
      v-if="isGM"
      class="question-add-panel card"
      @submit.prevent="handleAddQuestion"
    >
      <div>
        <h3>이 단계에 질문 추가</h3>
        <p class="muted">
          질문과 선택지는 서버에 저장되며 마스터의 선택 비교에도 표시됩니다.
        </p>
      </div>
      <label class="form-label">
        질문
        <input
          v-model="newQuestionPrompt"
          class="form-input"
          placeholder="질문 내용을 입력하세요"
          required
        />
      </label>
      <label class="form-label">
        선택지 (한 줄에 하나씩, 최소 2개)
        <textarea
          v-model="newQuestionChoices"
          class="form-textarea"
          rows="3"
          required
        ></textarea>
      </label>
      <button class="primary-button" type="submit" :disabled="addingQuestion">
        {{ addingQuestion ? "저장 중…" : "질문 추가" }}
      </button>
    </form>
    <div class="team-tabs">
      <button
        v-for="t in teams"
        :key="t.id"
        :class="['team-tab', { active: selectedTeamId === t.id }]"
        @click="selectTeam(t.id)"
      >
        <span class="team-dot" :style="{ background: t.color }"></span>
        {{ t.name }}
        <span v-if="teamRecordMap[t.id]?.completed" class="check-mark">✓</span>
      </button>
    </div>

    <div v-if="selectedTeam" class="record-editor card">
      <div class="editor-head">
        <div class="team-info">
          <span
            class="team-dot-lg"
            :style="{ background: selectedTeam.color }"
          ></span>
          <div>
            <h3>{{ selectedTeam.name }} 기록</h3>
            <span class="muted">{{ selectedTeam.region || "지역 미정" }}</span>
          </div>
        </div>
        <div v-if="isGM" class="status-toggle">
          <label class="check-label">
            <input
              type="checkbox"
              :checked="currentRecord?.completed"
              @change="handleToggleComplete"
            />
            <span>{{ currentRecord?.completed ? "✓ 완료됨" : "진행 중" }}</span>
          </label>
        </div>
      </div>
      <p v-if="isReadOnlyTeam" class="team-readonly-note">
        다른 팀의 완료된 선택을 보고 있습니다. 이 기록은 읽기 전용입니다.
      </p>
      <p v-if="isReadOnlyTeam && !currentRecord" class="empty-state">
        이 팀은 아직 공개된 완료 기록이 없습니다.
      </p>

      <!-- 질문 및 선택지 라디오 버튼 -->
      <div class="questions-list">
        <div
          v-for="(q, qi) in scenario.questions"
          :key="q.id"
          class="question-record-item"
        >
          <div class="q-title">
            <span class="q-num">Q{{ qi + 1 }}</span>
            <h4>{{ q.prompt }}</h4>
          </div>
          <div class="choice-options">
            <label
              v-for="c in q.choices"
              :key="c.id"
              :class="[
                'choice-radio',
                { checked: getSelectedChoice(q.id) === c.id },
              ]"
            >
              <input
                type="radio"
                :name="'q_' + q.id"
                :value="c.id"
                :checked="getSelectedChoice(q.id) === c.id"
                :disabled="isReadOnlyTeam || isPlayerPreview"
                @change="handleSelectChoice(q.id, c.id)"
              />
              <span class="choice-code-tag">{{ c.code }}</span>
              <span>{{ c.label }}</span>
            </label>
            <button
              v-if="getSelectedChoice(q.id)"
              class="text-button clear-choice"
              :disabled="isReadOnlyTeam || isPlayerPreview"
              @click="handleSelectChoice(q.id, null)"
            >
              선택 해제
            </button>
          </div>
        </div>
        <div v-if="!scenario.questions.length" class="empty-state">
          등록된 질문이 없습니다.
        </div>
      </div>

      <!-- GM 메모 -->
      <div
        v-if="scenario.questions.length && !isReadOnlyTeam"
        class="answer-save-actions"
      >
        <span class="muted">
          {{
            hasUnsavedAnswers
              ? "답변 변경 사항이 저장되지 않았습니다."
              : "답변이 서버에 저장되어 있습니다."
          }}
        </span>
        <button
          class="primary-button"
          type="button"
          :disabled="isReadOnlyTeam || !hasUnsavedAnswers || savingAnswers"
          :class="{ 'preview-disabled': isReadOnlyTeam || isPlayerPreview }"
          @click="handleSaveAnswers"
        >
          {{ savingAnswers ? "저장 중…" : "선택 답변 저장" }}
        </button>
      </div>

      <div v-if="isGM" class="gm-note-section">
        <label class="form-label">
          GM 전용 메모 (해당 팀 × 시나리오 플레이 기록)
          <textarea
            v-model="gmNoteInput"
            @change="handleSaveNote"
            class="form-textarea note-textarea"
            placeholder="예: 팀이 에렌탈을 신뢰함. 다음 세션에서 결과 반영."
          ></textarea>
        </label>
        <div class="note-actions">
          <button
            class="primary-button"
            :disabled="savingNote"
            @click="handleSaveNote"
          >
            {{ savingNote ? "저장 중..." : "GM 메모 저장" }}
          </button>
        </div>
      </div>
    </div>
    <CharacterNotesPanel
      v-if="selectedTeam && !isReadOnlyTeam"
      mode="scenario"
      :team-id="selectedTeam.id"
      :scenario-id="scenarioId"
      :team-characters="selectedTeam.characters || []"
    />
  </div>
  <div v-else-if="previewLocked" class="empty-state">
    이 시나리오 기록은 선택한 팀의 플레이어 화면에서 아직 공개되지 않았습니다.
    <router-link class="text-link" to="/scenarios"
      >시나리오 목록으로</router-link
    >
  </div>
</template>

<script>
import CharacterNotesPanel from "@/components/CharacterNotesPanel.vue";
import {
  getScenario,
  getOrCreateTeamScenario,
  getPlayerScenarioRecord,
  getTeamProgressRecords,
  getOrCreateTeamProgressStage,
  getProgressStageWithQuestions,
  addProgressStageQuestion,
  saveTeamScenarioStatus,
  saveTeamScenarioNote,
  saveTeamScenarioAnswer,
} from "@/services/scenarios";

export default {
  name: "ScenarioDetailView",
  components: { CharacterNotesPanel },
  props: {
    scenarioId: { type: String, required: true },
  },
  data() {
    return {
      scenario: null,
      previewLocked: false,
      selectedTeamId: null,
      teamRecordMap: {}, // { [teamId]: teamScenarioRecord }
      recordLoadRequestId: 0,
      gmNoteInput: "",
      savingNote: false,
      answerDrafts: {},
      savingAnswers: false,
      newQuestionPrompt: "",
      newQuestionChoices: "선택지 A\n선택지 B",
      addingQuestion: false,
    };
  },
  computed: {
    isGM() {
      return this.$store.getters.isGM;
    },
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    teams() {
      return this.$store.getters.sortedTeams;
    },
    selectedTeam() {
      return this.teams.find((t) => t.id === this.selectedTeamId);
    },
    currentRecord() {
      return this.teamRecordMap[this.selectedTeamId] || null;
    },
    isReadOnlyTeam() {
      return (
        !this.isGM &&
        this.selectedTeamId !== this.$store.getters.activePlayerTeamId
      );
    },
    hasUnsavedAnswers() {
      return Object.keys(this.answerDrafts).some((questionId) => {
        const saved = (this.currentRecord?.team_scenario_answers || []).find(
          (answer) => answer.question_id === questionId
        );
        return (saved?.choice_id || null) !== this.answerDrafts[questionId];
      });
    },
  },
  async mounted() {
    if (this.$route.query.teamId) {
      this.selectedTeamId = this.$route.query.teamId;
    } else if (this.teams.length) {
      this.selectedTeamId = this.teams[0].id;
    }
    await this.loadScenarioData();
    await this.loadCurrentTeamRecord();
  },
  watch: {
    "$store.state.gmPlayerPreviewMode"(enabled) {
      if (enabled) {
        this.loadScenarioData();
        this.loadCurrentTeamRecord();
      }
    },
    selectedTeamId() {
      this.loadCurrentTeamRecord();
    },
    "$store.state.playerTeamId"(teamId) {
      if (teamId) {
        this.selectedTeamId = teamId;
        this.loadScenarioData();
        this.loadCurrentTeamRecord();
      }
    },
    "$store.state.gmPreviewTeamId"(teamId) {
      if (this.isPlayerPreview && teamId) {
        this.selectedTeamId = teamId;
        this.loadScenarioData();
        this.loadCurrentTeamRecord();
      }
    },
    "$store.getters.campaignId"(campaignId) {
      if (campaignId) this.loadScenarioData();
    },
  },
  methods: {
    async loadScenarioData() {
      this.previewLocked = false;
      try {
        const isProgressStage = /^\d+$/.test(String(this.scenarioId));
        if (this.isPlayerPreview && this.selectedTeam) {
          const progressStep = Number(this.selectedTeam.progress_step) || 1;
          if (isProgressStage && Number(this.scenarioId) >= progressStep) {
            this.scenario = null;
            this.previewLocked = true;
            return;
          }
          if (!isProgressStage) {
            const visibleRecord = await getPlayerScenarioRecord(
              this.selectedTeamId,
              this.scenarioId
            );
            if (!visibleRecord) {
              this.scenario = null;
              this.previewLocked = true;
              return;
            }
          }
        }
        this.scenario = isProgressStage
          ? await getProgressStageWithQuestions(Number(this.scenarioId))
          : await getScenario(this.scenarioId);
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "시나리오 로드 실패: " + error.message,
          type: "error",
        });
      }
    },
    async loadCurrentTeamRecord() {
      if (!this.selectedTeamId || !this.scenarioId) return;
      const teamId = this.selectedTeamId;
      const requestId = ++this.recordLoadRequestId;
      this.answerDrafts = {};
      this.gmNoteInput = "";
      try {
        const isProgressStage = /^\d+$/.test(String(this.scenarioId));
        const record = isProgressStage
          ? this.isPlayerPreview || this.isReadOnlyTeam
            ? (await getTeamProgressRecords([teamId])).find(
                (item) => Number(item.step_number) === Number(this.scenarioId)
              ) || null
            : await getOrCreateTeamProgressStage(
                teamId,
                Number(this.scenarioId)
              )
          : this.isGM
          ? await getOrCreateTeamScenario(teamId, this.scenarioId)
          : await getPlayerScenarioRecord(teamId, this.scenarioId);
        if (requestId !== this.recordLoadRequestId) return;
        if (!record) {
          this.teamRecordMap = {
            ...this.teamRecordMap,
            [teamId]: null,
          };
          return;
        }
        this.teamRecordMap = {
          ...this.teamRecordMap,
          [teamId]: record,
        };
        this.gmNoteInput = record.gm_note || "";
      } catch (error) {
        if (requestId !== this.recordLoadRequestId) return;
        console.error(error);
      }
    },
    selectTeam(teamId) {
      this.selectedTeamId = teamId;
    },
    async handleAddQuestion() {
      if (this.isPlayerPreview) return;
      if (!/^\d+$/.test(String(this.scenarioId))) return;
      this.addingQuestion = true;
      try {
        const labels = this.newQuestionChoices
          .split(/\r?\n/)
          .map((label) => label.trim())
          .filter(Boolean);
        await addProgressStageQuestion(
          Number(this.scenarioId),
          this.newQuestionPrompt,
          labels
        );
        await this.loadScenarioData();
        this.newQuestionPrompt = "";
        this.newQuestionChoices = "선택지 A\n선택지 B";
        this.$store.dispatch("showToast", {
          message: "질문과 선택지를 추가했습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "질문 추가 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.addingQuestion = false;
      }
    },
    getSelectedChoice(questionId) {
      if (Object.prototype.hasOwnProperty.call(this.answerDrafts, questionId)) {
        return this.answerDrafts[questionId];
      }
      const rec = this.currentRecord;
      if (!rec) return null;
      const ans = (rec.team_scenario_answers || []).find(
        (a) => a.question_id === questionId
      );
      return ans ? ans.choice_id : null;
    },
    handleSelectChoice(questionId, choiceId) {
      if (this.isPlayerPreview || this.isReadOnlyTeam) return;
      if (!this.currentRecord || this.savingAnswers) return;
      this.answerDrafts = { ...this.answerDrafts, [questionId]: choiceId };
    },
    async handleSaveAnswers() {
      if (this.isPlayerPreview || this.isReadOnlyTeam) return;
      if (!this.currentRecord || !this.hasUnsavedAnswers || this.savingAnswers)
        return;
      this.savingAnswers = true;
      try {
        for (const question of this.scenario.questions) {
          if (
            !Object.prototype.hasOwnProperty.call(
              this.answerDrafts,
              question.id
            )
          )
            continue;
          const saved = (this.currentRecord.team_scenario_answers || []).find(
            (answer) => answer.question_id === question.id
          );
          const nextChoiceId = this.answerDrafts[question.id];
          if ((saved?.choice_id || null) === nextChoiceId) continue;
          await saveTeamScenarioAnswer(
            this.currentRecord.id,
            question.id,
            nextChoiceId
          );
        }
        await this.loadCurrentTeamRecord();
        this.$store.dispatch("showToast", {
          message: "선택 답변을 저장했습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "답변 저장 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.savingAnswers = false;
      }
    },
    async handleToggleComplete(e) {
      if (this.isPlayerPreview) return;
      if (!this.currentRecord) return;
      const completed = e.target.checked;
      try {
        const updated = await saveTeamScenarioStatus(this.currentRecord.id, {
          completed,
          gmNote: this.gmNoteInput,
        });
        this.teamRecordMap[this.selectedTeamId] = {
          ...this.currentRecord,
          completed: updated.completed,
        };
        this.$store.dispatch("showToast", {
          message: completed
            ? "시나리오가 완료 처리되었습니다."
            : "진행 중으로 변경되었습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "상태 변경 실패: " + error.message,
          type: "error",
        });
      }
    },
    async handleSaveNote() {
      if (this.isPlayerPreview) return;
      if (!this.currentRecord) return;
      this.savingNote = true;
      try {
        const updated = await saveTeamScenarioNote(
          this.currentRecord.id,
          this.gmNoteInput
        );
        this.teamRecordMap[this.selectedTeamId] = {
          ...this.currentRecord,
          gm_note: updated.gm_note,
        };
        this.$store.dispatch("showToast", {
          message: "GM 메모가 저장되었습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "메모 저장 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.savingNote = false;
      }
    },
  },
};
</script>

<style scoped>
/* 개별 시나리오 상세 정보와 진행 관리 화면에 적용됩니다. */
.scenario-detail-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.team-readonly-note {
  margin: 0 0 18px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--paper);
  color: var(--muted);
  font-size: 13px;
}
.header-actions {
  display: flex;
  gap: 10px;
}
.question-add-panel {
  display: grid;
  gap: 12px;
}
.question-add-panel h3 {
  margin: 0 0 4px;
}
.question-add-panel p {
  margin: 0;
}
.question-add-panel .primary-button {
  justify-self: start;
}

.team-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.team-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-weight: 600;
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  transition: all 0.15s;
}
.team-tab:hover {
  border-color: var(--accent);
}
.team-tab.active {
  border-color: var(--accent);
  background: rgba(201, 121, 84, 0.08);
  color: var(--accent);
}
.team-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.check-mark {
  color: var(--success);
  font-weight: 800;
}

.record-editor {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.team-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.team-dot-lg {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}
.team-info h3 {
  margin: 0;
  font-size: 18px;
}

.check-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}

.questions-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.answer-save-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}
.answer-save-actions .muted {
  margin-right: auto;
}
.answer-save-actions .primary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.question-record-item {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 16px;
}
.q-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.q-title h4 {
  margin: 0;
  font-size: 15px;
}
.q-num {
  font: 700 12px "DM Mono", monospace;
  color: var(--accent);
}

.choice-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.choice-radio {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 14px;
}
.choice-radio:hover {
  border-color: var(--accent);
}
.choice-radio.checked {
  border-color: var(--accent);
  background: rgba(201, 121, 84, 0.06);
  font-weight: 600;
}
.choice-code-tag {
  font: 700 11px "DM Mono", monospace;
  color: var(--accent);
  background: var(--paper);
  padding: 2px 6px;
  border-radius: 2px;
}
.clear-choice {
  font-size: 12px;
  margin-top: 4px;
  align-self: flex-start;
}

.gm-note-section {
  background: rgba(201, 121, 84, 0.04);
  border: 1px solid rgba(201, 121, 84, 0.2);
  padding: 20px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.note-textarea {
  min-height: 100px;
  background: var(--panel);
}
.note-actions {
  display: flex;
  justify-content: flex-end;
}
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--muted);
}

@media (max-width: 600px) {
  .scenario-detail-view {
    gap: 16px;
  }
  .header-actions {
    flex-wrap: wrap;
  }
  .header-actions > * {
    flex: 1 1 auto;
  }
  .team-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 6px;
  }
  .team-tab {
    flex: 0 0 auto;
    min-height: 42px;
  }
  .editor-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .editor-head > * {
    max-width: 100%;
  }
  .question-record-item,
  .gm-note-section {
    padding: 14px;
  }
  .choice-radio {
    align-items: flex-start;
    padding: 11px 12px;
  }
  .answer-save-actions {
    align-items: stretch;
  }
  .answer-save-actions .muted {
    flex-basis: 100%;
  }
  .answer-save-actions .primary-button {
    width: 100%;
  }
}
</style>
