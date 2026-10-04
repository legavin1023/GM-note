<template>
  <div v-if="team" class="team-detail-view">
    <!-- 상단 헤더 -->
    <div class="team-header-card card">
      <div class="team-header-top">
        <div
          class="team-symbol-lg"
          :style="{ background: team.color }"
          :aria-label="team.name + ' 팀 색상'"
          role="img"
        ></div>
        <div class="team-header-info">
          <div class="team-title-row">
            <h2>{{ team.name }}</h2>
            <span class="region-badge">{{ team.region || "지역 미정" }}</span>
          </div>
          <p class="muted">{{ team.description || "설명이 없습니다." }}</p>
        </div>
        <div v-if="isGM" class="team-header-actions">
          <button class="outline-button" @click="showEditModal = true">
            팀 정보 수정
          </button>
          <button class="danger-button" @click="handleDeleteTeam">
            팀 삭제
          </button>
        </div>
      </div>

      <div class="team-header-stats">
        <div class="stat-item">
          <span class="eyebrow">CHARACTERS</span>
          <strong>{{ (team.characters || []).length }}<small>명</small></strong>
        </div>
        <div class="stat-item">
          <span class="eyebrow">PROGRESS</span>
          <strong>{{ progressPct }}<small>%</small></strong>
        </div>
        <div class="stat-item">
          <span class="eyebrow">STEP</span>
          <strong
            >{{ team.progress_step || 1
            }}<small>/ {{ progressStages.length }}</small></strong
          >
        </div>
      </div>
    </div>

    <!-- 탭 / 섹션 -->
    <!-- 캐릭터 섹션 -->
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">CHARACTERS</span>
          <h3 class="section-title">소속 캐릭터</h3>
        </div>
        <button v-if="isGM" class="primary-button" @click="handleAddCharacter">
          ＋ 캐릭터 추가
        </button>
      </div>

      <div class="character-grid">
        <component
          :is="isGM ? 'router-link' : 'div'"
          v-for="char in team.characters || []"
          :key="char.id"
          :to="isGM ? '/characters/' + char.id : undefined"
          class="character-card card"
        >
          <div class="char-avatar" :style="{ backgroundColor: team.color }">
            <img
              v-if="char.token_url && !imageErrors[char.id]"
              :src="char.token_url"
              class="char-avatar-image"
              :alt="char.character_name || 'Character token'"
              @error="markImageError(char.id)"
            />
            <span v-if="!char.token_url || imageErrors[char.id]">{{
              (char.character_name || "?")[0]
            }}</span>
          </div>
          <div class="char-info">
            <h4>{{ char.character_name || "이름 없음" }}</h4>
            <span class="char-sub muted">
              {{ char.age || "나이 미정" }} · {{ char.race || "종족미정" }} ·
              {{ char.class || "클래스미정" }} · Lv.{{ char.level || 1 }}
            </span>
          </div>
          <span v-if="isGM" class="char-arrow">↗</span>
        </component>
        <div v-if="!(team.characters || []).length" class="empty-state">
          소속된 캐릭터가 없습니다. 캐릭터를 추가해보세요.
        </div>
      </div>
    </section>

    <!-- 시나리오 진행 및 기록 -->
    <section v-if="isGM" class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">SCENARIO TRACKER</span>
          <h3 class="section-title">시나리오 진행 상태 및 선택</h3>
        </div>
      </div>

      <div class="stage-tracker">
        <h4>
          진행 단계 · {{ team.progress_step || 1 }}단계 /
          {{ progressStages.length }}
        </h4>
        <div v-if="!progressStages.length" class="empty-state">
          등록된 진행 단계가 없습니다.
        </div>
        <label
          v-for="stage in progressStages"
          :key="stage.step_number"
          class="stage-row card"
        >
          <input
            type="checkbox"
            :checked="getStageRecord(stage.step_number)?.completed || false"
            :disabled="stageSaving[stage.step_number]"
            @change="handleToggleStage(stage, $event)"
          />
          <span class="stage-number">{{ stage.step_number }}</span>
          <span class="stage-copy">
            <strong>{{ stage.title }}</strong>
            <small class="muted">{{ stage.description }}</small>
          </span>
          <span v-if="stageSaving[stage.step_number]" class="muted"
            >저장 중…</span
          >
        </label>
      </div>
      <div class="scenario-board">
        <div
          v-for="scenario in scenarios"
          :key="scenario.id"
          class="scenario-row card"
        >
          <div class="sr-head">
            <span class="scenario-code">{{ scenario.code }}</span>
            <div class="sr-title">
              <h4>{{ scenario.title }}</h4>
              <span class="muted">{{ scenario.description }}</span>
            </div>
            <router-link
              :to="{
                path: '/scenarios/' + scenario.id,
                query: { teamId: team.id },
              }"
              class="outline-button"
            >
              기록 수정 →
            </router-link>
          </div>
          <!-- 팀의 선택 요약 -->
          <div class="sr-body">
            <div class="sr-answers">
              <div
                v-for="q in scenario.questions"
                :key="q.id"
                class="sr-answer-item"
              >
                <span class="q-label">{{ q.code }}:</span>
                <span class="a-label">{{
                  getAnswerLabel(scenario.id, q)
                }}</span>
              </div>
            </div>
            <div v-if="getTeamRecord(scenario.id)?.gm_note" class="sr-note">
              <strong>GM 메모:</strong> {{ getTeamRecord(scenario.id).gm_note }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 팀 갤러리 -->
    <section v-if="isGM" class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">TEAM GALLERY</span>
          <h3 class="section-title">팀 토큰 갤러리</h3>
        </div>
        <router-link
          :to="{ path: '/gallery', query: { teamId: team.id } }"
          class="text-button"
        >
          전체 갤러리 보기 →
        </router-link>
      </div>

      <div class="gallery-preview-grid">
        <div
          v-for="img in teamImages"
          :key="img.id"
          class="gallery-preview-item"
        >
          <img :src="img.url" :alt="img.caption" />
          <div class="gp-caption">{{ img.caption || "이미지" }}</div>
        </div>
        <div v-if="!teamImages.length" class="empty-state">
          등록된 팀 이미지가 없습니다.
        </div>
      </div>
    </section>

    <!-- 팀 수정 모달 -->
    <div
      v-if="showEditModal"
      class="modal-overlay"
      @click.self="showEditModal = false"
    >
      <div class="modal">
        <div class="modal-head">
          <h3>팀 정보 수정</h3>
          <button class="delete-button" @click="showEditModal = false">
            ×
          </button>
        </div>
        <div class="modal-body">
          <label class="form-label"
            >팀 이름 <input v-model="editForm.name" class="form-input" required
          /></label>
          <label class="form-label"
            >지역 <input v-model="editForm.region" class="form-input"
          /></label>
          <label class="form-label"
            >설명
            <textarea
              v-model="editForm.description"
              class="form-textarea"
            ></textarea>
          </label>
          <label class="form-label">
            색상
            <div class="color-row">
              <input
                v-model="editForm.color"
                type="color"
                class="color-picker"
              />
              <span>{{ editForm.color }}</span>
            </div>
          </label>
          <div class="form-row">
            <label class="form-label"
              >진행 단계
              <input
                v-model.number="editForm.progress_step"
                type="number"
                min="1"
                max="25"
                class="form-input"
            /></label>
            <label class="form-label"
              >전체 단계
              <input
                v-model.number="editForm.total_steps"
                type="number"
                min="1"
                max="25"
                class="form-input"
            /></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="secondary-button" @click="showEditModal = false">
            취소
          </button>
          <button
            class="primary-button"
            :disabled="saving"
            @click="handleUpdateTeam"
          >
            {{ saving ? "저장 중..." : "저장" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { updateTeam, deleteTeam } from "@/services/teams";
import { saveCharacter } from "@/services/characters";
import {
  getTeamScenarios,
  getOrCreateTeamProgressStage,
  saveTeamScenarioStatus,
} from "@/services/scenarios";
import { getTeamImages } from "@/services/images";


export default {
  name: "TeamDetailView",
  props: {
    teamId: { type: String, required: true },
  },
  data() {
    return {
      showEditModal: false,
      saving: false,
      editForm: {},
      teamScenarios: [],
      teamImages: [],
      stageSaving: {},
      imageErrors: {},

    };
  },
  computed: {
    team() {
      return this.$store.getters.teamById(this.teamId);
    },
    isGM() {
      return this.$store.state.userRole !== "player";
    },
    scenarios() {
      return this.$store.getters.sortedScenarios;
    },
    progressStages() {
      return this.$store.state.progressStages;
    },
    progressPct() {
      if (!this.progressStages.length) return 0;
      const currentStep = Number(this.team.progress_step) || 1;
      return Math.min(
        Math.round((currentStep / this.progressStages.length) * 100),
        100
      );
    },
  },
  async mounted() {
    if (this.team) {
      this.initEditForm();
      await this.loadData();
    }
  },
  watch: {
    teamId() {
      if (this.team) {
        this.initEditForm();
        this.loadData();
      }
    },
  },
  methods: {
    markImageError(characterId) {
      this.imageErrors = { ...this.imageErrors, [characterId]: true };
    },
    initEditForm() {
      this.editForm = {
        name: this.team.name,
        region: this.team.region,
        description: this.team.description,
        color: this.team.color,
        progress_step: this.team.progress_step || 1,
        total_steps: this.team.total_steps || 5,
      };
    },
    async loadData() {
      if (!this.isGM) return;
      try {
        const [ts, imgs] = await Promise.all([
          getTeamScenarios(this.teamId),
          getTeamImages(this.teamId),
        ]);
        this.teamScenarios = ts;
        this.teamImages = imgs;
      } catch (e) {
        console.error(e);
      }
    },
    getTeamRecord(scenarioId) {
      return this.teamScenarios.find((ts) => ts.scenario_id === scenarioId);
    },
    getStageRecord(stepNumber) {
      return this.teamScenarios.find(
        (record) => record.step_number === stepNumber
      );
    },
    async handleToggleStage(stage, event) {
      const step = stage.step_number;
      const completed = event.target.checked;
      this.stageSaving = { ...this.stageSaving, [step]: true };
      try {
        const record = await getOrCreateTeamProgressStage(this.teamId, step);
        const saved = await saveTeamScenarioStatus(record.id, {
          completed,
          gmNote: record.gm_note || "",
        });
        const index = this.teamScenarios.findIndex(
          (item) => item.id === saved.id
        );
        const records = [...this.teamScenarios];
        if (index < 0) records.push(saved);
        else records.splice(index, 1, { ...records[index], ...saved });
        this.teamScenarios = records;
      } catch (error) {
        event.target.checked = !completed;
        this.$store.dispatch("showToast", {
          message: "단계 저장 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.stageSaving = { ...this.stageSaving, [step]: false };
      }
    },
    getAnswerLabel(scenarioId, question) {
      const ts = this.getTeamRecord(scenarioId);
      if (!ts) return "미선택";
      const ans = (ts.team_scenario_answers || []).find(
        (a) => a.question_id === question.id
      );
      if (!ans) return "미선택";
      const choice = (question.choices || []).find(
        (c) => c.id === ans.choice_id
      );
      return choice ? choice.label : "미선택";
    },
    async handleUpdateTeam() {
      this.saving = true;
      try {
        const updated = await updateTeam(this.teamId, this.editForm);
        this.$store.commit("updateTeam", { ...this.team, ...updated });
        this.$store.dispatch("showToast", {
          message: "팀 정보가 수정되었습니다.",
          type: "success",
        });
        this.showEditModal = false;
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "수정 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.saving = false;
      }
    },
    async handleDeleteTeam() {
      if (
        !confirm(
          `'${this.team.name}' 팀을 정말 삭제하시겠습니까? 소속 캐릭터와 관련 기록이 모두 삭제될 수 있습니다.`
        )
      )
        return;
      try {
        await deleteTeam(this.teamId);
        this.$store.commit("removeTeam", this.teamId);
        this.$store.dispatch("showToast", {
          message: "팀이 삭제되었습니다.",
          type: "success",
        });
        this.$router.push({ name: "teams" });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "삭제 실패: " + error.message,
          type: "error",
        });
      }
    },
    async handleAddCharacter() {
      const newChar = {
        team_id: this.teamId,
        username: "",
        character_name: "새 캐릭터",
        player: "홍길동",
        level: 1,
        race: "인간",
        class: "전사",
      };
      try {
        const saved = await saveCharacter(newChar);
        const updatedChars = [...(this.team.characters || []), saved];
        this.$store.commit("updateTeam", {
          ...this.team,
          characters: updatedChars,
          users: updatedChars,
        });
        this.$store.dispatch("showToast", {
          message: "새 캐릭터가 추가되었습니다.",
          type: "success",
        });
        this.$router.push(`/characters/${saved.id}`);
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "캐릭터 추가 실패: " + error.message,
          type: "error",
        });
      }
    },
  },
};
</script>

<style scoped>
/* 개별 팀의 상세 정보와 팀원 관리 화면에 적용됩니다. */
.team-detail-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.team-header-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.team-header-top {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.team-symbol-lg {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  color: #fff;
  font-size: 24px;
  font-weight: 800;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.team-header-info {
  flex: 1;
  min-width: 200px;
}
.team-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.team-title-row h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
}
.region-badge {
  background: var(--line);
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.team-header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.team-header-stats {
  display: flex;
  gap: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.stat-item strong {
  display: block;
  font-size: 20px;
  font-weight: 800;
}
.stat-item strong small {
  font-size: 13px;
  color: var(--muted);
  margin-left: 2px;
}

.section-block {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 24px;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.character-card {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--ink);
  transition: border-color 0.15s, transform 0.1s;
  padding: 14px;
}
.character-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.char-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
  background-color: var(--line);
  overflow: hidden;
}
.char-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.char-info {
  flex: 1;
  min-width: 0;
}
.char-info h4 {
  margin: 0 0 2px;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.char-sub {
  display: block;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.char-player {
  display: block;
  font-size: 11px;
}
.char-arrow {
  color: var(--muted);
  font-size: 14px;
}

.scenario-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stage-tracker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}
.stage-tracker h4 {
  margin: 0 0 4px;
}
.stage-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}
.stage-number {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--line);
  color: var(--accent);
  font-weight: 800;
  flex-shrink: 0;
}
.stage-copy {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.stage-copy small {
  font-size: 12px;
}
.scenario-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}
.sr-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.scenario-code {
  font: 700 12px "DM Mono", monospace;
  background: var(--line);
  padding: 4px 8px;
  border-radius: 2px;
  color: var(--muted);
}
.sr-title {
  flex: 1;
}
.sr-title h4 {
  margin: 0 0 2px;
  font-size: 15px;
}
.sr-answers {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
}
.sr-answer-item {
  background: var(--paper);
  border: 1px solid var(--line);
  padding: 4px 10px;
  border-radius: 4px;
}
.q-label {
  font-weight: 700;
  color: var(--muted);
  margin-right: 6px;
}
.a-label {
  font-weight: 600;
  color: var(--accent);
}
.sr-note {
  background: rgba(201, 121, 84, 0.06);
  border: 1px solid rgba(201, 121, 84, 0.2);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.gallery-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.gallery-preview-item {
  height: 100px;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--line);
}
.gallery-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gp-caption {
  position: absolute;
  bottom: 0;
  inset-x: 0;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  padding: 4px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
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
.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--muted);
  font-size: 13px;
  width: 100%;
}
</style>
