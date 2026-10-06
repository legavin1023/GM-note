<template>
  <div class="admin-import-view">
    <div class="section-heading">
      <div>
        <span class="eyebrow">ADMIN / IMPORT</span>
        <h2 class="section-title">시나리오 JSON Import</h2>
      </div>
      <router-link to="/admin/scenarios" class="outline-button"
        >← 관리 화면으로</router-link
      >
    </div>

    <!-- 파일 선택 및 드래그존 -->
    <div class="import-card card">
      <div
        class="file-dropzone"
        :class="{ dragging: isDragging }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleFileDrop"
      >
        <p class="muted">
          JSON 시나리오 파일을 선택하거나 이곳으로 드래그 앤 드롭하세요
        </p>
        <label class="primary-button file-label">
          파일 선택
          <input
            type="file"
            accept="application/json"
            class="hidden-input"
            @change="handleFileSelect"
          />
        </label>
      </div>

      <!-- 에러 목록 -->
      <div v-if="errors.length" class="error-box">
        <h3>❌ 검증 오류가 발견되었습니다 ({{ errors.length }}건)</h3>
        <ul>
          <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
        </ul>
      </div>

      <!-- 성공 미리보기 -->
      <div v-if="parsedData && !errors.length" class="preview-box">
        <div class="preview-head">
          <h3>✓ 검증 완료 — 미리보기</h3>
          <span class="badge badge-success"
            >{{ parsedData.scenarios.length }}개 시나리오</span
          >
        </div>

        <div class="preview-scenarios">
          <div
            v-for="s in parsedData.scenarios"
            :key="s.code"
            class="preview-item"
          >
            <span class="code-badge">{{ s.code }}</span>
            <strong>{{ s.title }}</strong>
            <span class="muted">({{ (s.questions || []).length }}개 질문)</span>
          </div>
        </div>

        <div class="confirm-actions">
          <button
            class="primary-button"
            :disabled="importing"
            @click="handleConfirmImport"
          >
            {{ importing ? "DB 반영 중..." : "DB에 반영하기" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { importScenariosFromJson, getScenarios } from "@/services/scenarios";

export default {
  name: "AdminImportView",
  data() {
    return {
      isDragging: false,
      parsedData: null,
      errors: [],
      importing: false,
    };
  },
  computed: {
    campaignId() {
      return this.$store.getters.campaignId;
    },
  },
  methods: {
    handleFileSelect(e) {
      const file = e.target.files[0];
      if (file) this.processFile(file);
    },
    handleFileDrop(e) {
      this.isDragging = false;
      const file = e.dataTransfer.files[0];
      if (file) this.processFile(file);
    },
    processFile(file) {
      this.parsedData = null;
      this.errors = [];

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target.result);
          this.validateJson(json);
        } catch (err) {
          this.errors.push(
            "❌ JSON 문법 오류: 올바른 JSON 형식이 아닙니다. (" +
              err.message +
              ")"
          );
        }
      };
      reader.readAsText(file);
    },
    validateJson(data) {
      const errs = [];

      if (!data || typeof data !== "object") {
        errs.push("❌ JSON Root: 객체 형태여야 합니다.");
        this.errors = errs;
        return;
      }

      if (!Array.isArray(data.scenarios)) {
        errs.push("❌ scenarios 필드가 없거나 배열이 아닙니다.");
        this.errors = errs;
        return;
      }

      const scenarioCodes = new Set();

      data.scenarios.forEach((s, sIdx) => {
        const sPath = `scenarios[${sIdx}]`;
        if (!s.code) errs.push(`❌ ${sPath}.code 가 누락되었습니다.`);
        else if (scenarioCodes.has(s.code))
          errs.push(`❌ ${sPath}.code (${s.code}) 가 중복되었습니다.`);
        else scenarioCodes.add(s.code);

        if (!s.title) errs.push(`❌ ${sPath}.title 이 누락되었습니다.`);

        if (s.questions && !Array.isArray(s.questions)) {
          errs.push(`❌ ${sPath}.questions 가 배열이 아닙니다.`);
        } else if (s.questions) {
          const qCodes = new Set();
          s.questions.forEach((q, qIdx) => {
            const qPath = `${sPath}.questions[${qIdx}]`;
            if (!q.code) errs.push(`❌ ${qPath}.code 가 누락되었습니다.`);
            else if (qCodes.has(q.code))
              errs.push(
                `❌ ${qPath}.code (${q.code}) 가 ${s.code} 내에서 중복되었습니다.`
              );
            else qCodes.add(q.code);

            if (!q.prompt) errs.push(`❌ ${qPath}.prompt 가 누락되었습니다.`);

            if (q.choices && !Array.isArray(q.choices)) {
              errs.push(`❌ ${qPath}.choices 가 배열이 아닙니다.`);
            } else if (q.choices) {
              const cCodes = new Set();
              q.choices.forEach((c, cIdx) => {
                const cPath = `${qPath}.choices[${cIdx}]`;
                if (!c.code) errs.push(`❌ ${cPath}.code 가 누락되었습니다.`);
                else if (cCodes.has(c.code))
                  errs.push(
                    `❌ ${cPath}.code (${c.code}) 가 ${q.code} 내에서 중복되었습니다.`
                  );
                else cCodes.add(c.code);

                if (!c.label) errs.push(`❌ ${cPath}.label 이 누락되었습니다.`);
              });
            }
          });
        }
      });

      this.errors = errs;
      if (!errs.length) {
        this.parsedData = data;
      }
    },
    async handleConfirmImport() {
      if (!this.parsedData || !this.campaignId) return;
      this.importing = true;
      try {
        await importScenariosFromJson(this.campaignId, this.parsedData);
        // 스토어 백업갱신
        const scenarios = await getScenarios(this.campaignId);
        this.$store.commit("setScenarios", scenarios);
        this.$store.dispatch("showToast", {
          message: "시나리오가 성공적으로 DB에 반영되었습니다.",
          type: "success",
        });
        this.$router.push("/admin/scenarios");
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "DB 반영 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.importing = false;
      }
    },
  },
};
</script>

<style scoped>
/* 관리자 시나리오 가져오기 화면의 폼과 미리 보기 영역에 적용됩니다. */
.admin-import-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.import-card {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.file-dropzone {
  border: 2px dashed var(--line);
  border-radius: 4px;
  padding: 40px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  transition: all 0.15s;
}
.file-dropzone.dragging {
  border-color: var(--accent);
  background: rgba(201, 121, 84, 0.05);
}
.file-label {
  cursor: pointer;
}
.hidden-input {
  display: none;
}

.error-box {
  background: rgba(224, 96, 96, 0.08);
  border: 1px solid rgba(224, 96, 96, 0.3);
  padding: 16px 20px;
  border-radius: 4px;
  color: var(--error);
}
.error-box h3 {
  margin: 0 0 10px;
  font-size: 15px;
}
.error-box ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-box {
  background: rgba(74, 159, 110, 0.06);
  border: 1px solid rgba(74, 159, 110, 0.25);
  padding: 20px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.preview-head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--success);
}
.preview-scenarios {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.code-badge {
  font: 700 11px "DM Mono", monospace;
  background: var(--panel);
  padding: 2px 6px;
  border-radius: 2px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 600px) {
  .admin-import-view,
  .import-card {
    gap: 16px;
  }
  .file-dropzone {
    padding: 26px 16px;
  }
  .preview-box {
    padding: 14px;
  }
  .preview-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .preview-item {
    align-items: flex-start;
    min-width: 0;
    flex-wrap: wrap;
    overflow-wrap: anywhere;
  }
  .confirm-actions,
  .confirm-actions > * {
    width: 100%;
  }
}
</style>
