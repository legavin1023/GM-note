<template>
  <section class="npc-page">
    <header class="npc-heading">
      <div>
        <span class="eyebrow">SCENARIO CAST</span>
        <h2>{{ scenarioLabel }} 주요 NPC</h2>
        <p class="muted">이 시나리오에 등장하는 주요 인물과 토큰입니다.</p>
      </div>
      <router-link class="outline-button" to="/scenarios"
        >시나리오로 돌아가기</router-link
      >
    </header>

    <div v-if="isGM" class="npc-editor card">
      <h3>{{ editingId ? "NPC 정보 수정" : "주요 NPC 추가" }}</h3>
      <div class="npc-fields">
        <label class="form-label"
          >이름<input
            v-model.trim="draft.name"
            class="form-input"
            maxlength="100"
        /></label>
        <label class="form-label"
          >나이<input
            v-model.trim="draft.age"
            class="form-input"
            maxlength="40"
            placeholder="예: 34세"
        /></label>
        <label class="form-label"
          >성별<input
            v-model.trim="draft.gender"
            class="form-input"
            maxlength="40"
        /></label>
        <div class="form-label npc-token-field">
          <label for="npc-token-file">토큰 이미지 첨부</label>
          <input
            id="npc-token-file"
            ref="tokenFile"
            class="form-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            :disabled="saving"
            @change="selectTokenFile"
          />
          <div
            v-if="tokenPreview || draft.token_url"
            class="npc-token-preview-wrap"
          >
            <img
              class="npc-token-preview"
              :src="tokenPreview || draft.token_url"
              alt="NPC 토큰 미리보기"
            />
            <button
              class="text-button"
              type="button"
              :disabled="saving"
              @click="clearTokenImage"
            >
              이미지 제거
            </button>
          </div>
          <small class="muted">JPEG, PNG, WebP, GIF · 최대 10MB</small>
        </div>
      </div>
      <div class="npc-editor-actions">
        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
        <button
          class="primary-button"
          type="button"
          :disabled="saving"
          @click="saveNpc"
        >
          {{ saving ? "저장 중…" : editingId ? "수정 저장" : "NPC 추가" }}
        </button>
        <button
          v-if="editingId"
          class="text-button"
          type="button"
          :disabled="saving"
          @click="resetForm"
        >
          취소
        </button>
      </div>
    </div>

    <p v-if="loading" class="empty-state">NPC를 불러오는 중…</p>
    <div v-else-if="error" class="empty-state error-state" role="alert">
      <p>{{ error }}</p>
      <button class="secondary-button" type="button" @click="loadNpcs">
        다시 불러오기
      </button>
    </div>
    <div v-else-if="!npcs.length" class="empty-state">
      아직 등록된 주요 NPC가 없습니다.
    </div>
    <div v-else class="npc-grid">
      <article v-for="npc in npcs" :key="npc.id" class="npc-card card">
        <img
          v-if="npc.token_url"
          class="npc-token"
          :src="npc.token_url"
          :alt="`${npc.name} 토큰`"
          @error="hideBrokenToken"
        />
        <div v-else class="npc-token npc-token-empty" aria-hidden="true">
          NPC
        </div>
        <div class="npc-card-content">
          <h3>{{ npc.name }}</h3>
          <p class="npc-facts">
            <span v-if="npc.age">{{ npc.age }}</span>
            <span v-if="npc.gender">{{ npc.gender }}</span>
            <span v-if="!npc.age && !npc.gender">정보 없음</span>
          </p>
          <p class="npc-rating-summary">
            {{ ratingLabel(npc.id) }}
          </p>
          <router-link
            class="primary-button npc-feedback-link"
            :to="{ name: 'npc-feedback', params: { npcId: npc.id } }"
          >
            평점과 댓글 보기
          </router-link>
          <div v-if="isGM" class="npc-admin-actions">
            <button class="text-button" type="button" @click="editNpc(npc)">
              수정
            </button>
            <button
              class="text-button npc-delete"
              type="button"
              :disabled="deletingId === npc.id"
              @click="deleteNpc(npc)"
            >
              {{ deletingId === npc.id ? "삭제 중…" : "삭제" }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script>
import { supabase } from "@/supabase";
import { formatNpcRating, getNpcRatingSummaries } from "@/services/npcRatings";

const emptyDraft = () => ({ name: "", age: "", gender: "", token_url: "" });
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export default {
  name: "ScenarioNpcsView",
  data() {
    return {
      npcs: [],
      ratingSummaries: {},
      ratingsError: "",
      draft: emptyDraft(),
      editingId: null,
      deletingId: null,
      saving: false,
      loading: false,
      error: "",
      formError: "",
      tokenFile: null,
      tokenPreview: "",
      uploadedTokenPath: "",
    };
  },
  computed: {
    isGM() {
      return this.$store.getters.isGM;
    },
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    campaignId() {
      return this.$store.getters.campaignId;
    },
    scenarioStep() {
      return Number(this.$route.params.scenarioId);
    },
    scenarioLabel() {
      const stage = (this.$store.state.progressStages || []).find(
        (item) => Number(item.step_number) === this.scenarioStep
      );
      return stage?.title || stage?.name || `시나리오 ${this.scenarioStep}`;
    },
  },
  watch: {
    "$store.state.gmPlayerPreviewMode"(enabled) {
      if (!enabled) return;
      const team = this.$store.getters.teamById(
        this.$store.getters.activePlayerTeamId
      );
      if (!team || this.scenarioStep >= (Number(team.progress_step) || 1)) {
        this.$router.replace({ name: "scenarios" });
      }
    },
    campaignId() {
      this.loadNpcs();
    },
    "$route.params.scenarioId"() {
      this.resetForm();
      this.loadNpcs();
    },
  },
  mounted() {
    this.loadNpcs();
  },
  beforeUnmount() {
    this.releaseTokenPreview();
  },
  methods: {
    async loadNpcs() {
      if (
        !this.campaignId ||
        !Number.isInteger(this.scenarioStep) ||
        this.scenarioStep < 1
      ) {
        this.error = "시나리오 정보를 확인할 수 없습니다.";
        return;
      }
      this.loading = true;
      this.error = "";
      const { data, error } = await supabase
        .from("scenario_npcs")
        .select(
          "id, campaign_id, scenario_step, name, age, gender, token_url, created_at"
        )
        .eq("campaign_id", this.campaignId)
        .eq("scenario_step", this.scenarioStep)
        .order("name", { ascending: true });
      if (error) this.error = `NPC를 불러오지 못했습니다: ${error.message}`;
      else {
        this.npcs = data || [];
        try {
          this.ratingSummaries = await getNpcRatingSummaries(
            this.npcs.map((npc) => npc.id)
          );
          this.ratingsError = "";
        } catch (ratingError) {
          this.ratingSummaries = {};
          this.ratingsError = ratingError.message;
        }
      }
      this.loading = false;
    },
    ratingLabel(npcId) {
      return this.ratingsError
        ? "평점 확인 불가"
        : formatNpcRating(this.ratingSummaries[npcId]);
    },
    async saveNpc() {
      if (!this.isGM || this.saving) return;
      if (!this.draft.name.trim()) {
        this.formError = "이름을 입력해 주세요.";
        return;
      }
      this.saving = true;
      this.formError = "";
      let uploadedPath = "";
      try {
        let tokenUrl = this.draft.token_url.trim();
        if (this.tokenFile) {
          uploadedPath = await this.uploadTokenImage(this.tokenFile);
          this.uploadedTokenPath = uploadedPath;
          tokenUrl = this.storagePublicUrl(uploadedPath);
        }
        const payload = {
          campaign_id: this.campaignId,
          scenario_step: this.scenarioStep,
          name: this.draft.name.trim(),
          age: this.draft.age.trim(),
          gender: this.draft.gender.trim(),
          token_url: tokenUrl,
        };
        const request = this.editingId
          ? supabase
              .from("scenario_npcs")
              .update(payload)
              .eq("id", this.editingId)
          : supabase
              .from("scenario_npcs")
              .insert({ ...payload, created_by: this.$store.state.gmUser.id });
        const { error } = await request;
        if (error) throw error;
        this.uploadedTokenPath = "";
        this.resetForm();
        await this.loadNpcs();
      } catch (error) {
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage
            .from("campaign-assets")
            .remove([uploadedPath]);
          if (cleanupError)
            console.error(
              "[NPC] failed to clean up unreferenced token",
              cleanupError
            );
          this.uploadedTokenPath = "";
        }
        this.formError = `저장하지 못했습니다: ${error.message || error}`;
      } finally {
        this.saving = false;
      }
    },
    selectTokenFile(event) {
      const file = event.target.files?.[0] || null;
      if (!file) return;
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        this.formError =
          "JPEG, PNG, WebP, GIF 이미지 파일만 첨부할 수 있습니다.";
        event.target.value = "";
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        this.formError = "이미지는 파일당 10MB 이하로 첨부해 주세요.";
        event.target.value = "";
        return;
      }
      this.releaseTokenPreview();
      this.tokenFile = file;
      this.tokenPreview = URL.createObjectURL(file);
      this.draft.token_url = "";
      this.formError = "";
    },
    clearTokenImage() {
      this.releaseTokenPreview();
      this.tokenFile = null;
      this.draft.token_url = "";
      if (this.$refs.tokenFile) this.$refs.tokenFile.value = "";
    },
    releaseTokenPreview() {
      if (this.tokenPreview) URL.revokeObjectURL(this.tokenPreview);
      this.tokenPreview = "";
    },
    async uploadTokenImage(file) {
      const extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
      }[file.type];
      const path = `npc-tokens/${
        this.campaignId
      }/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from("campaign-assets")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
      if (error) throw error;
      return path;
    },
    storagePublicUrl(path) {
      const { data } = supabase.storage
        .from("campaign-assets")
        .getPublicUrl(path);
      return data.publicUrl;
    },
    editNpc(npc) {
      this.editingId = npc.id;
      this.clearTokenImage();
      this.draft = {
        name: npc.name,
        age: npc.age || "",
        gender: npc.gender || "",
        token_url: npc.token_url || "",
      };
      this.formError = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    resetForm() {
      this.editingId = null;
      this.releaseTokenPreview();
      this.tokenFile = null;
      if (this.$refs.tokenFile) this.$refs.tokenFile.value = "";
      this.draft = emptyDraft();
      this.formError = "";
    },
    async deleteNpc(npc) {
      if (
        !this.isGM ||
        this.isPlayerPreview ||
        this.deletingId ||
        !window.confirm(
          `${npc.name} NPC를 삭제할까요? 평점과 댓글도 함께 삭제됩니다.`
        )
      )
        return;
      this.deletingId = npc.id;
      const { error } = await supabase
        .from("scenario_npcs")
        .delete()
        .eq("id", npc.id);
      if (error) this.error = `삭제하지 못했습니다: ${error.message}`;
      else this.npcs = this.npcs.filter((item) => item.id !== npc.id);
      this.deletingId = null;
    },
    hideBrokenToken(event) {
      event.target.style.display = "none";
    },
  },
};
</script>

<style scoped>
.npc-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.npc-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.npc-heading h2 {
  margin: 6px 0;
  color: var(--ink);
}
.npc-heading p {
  margin: 0;
}
.npc-editor h3 {
  margin: 0 0 14px;
}
.npc-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.npc-token-field {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.npc-token-preview-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.npc-token-preview {
  width: 96px;
  height: 96px;
  object-fit: contain;
  border-radius: 5px;
  background: var(--paper);
}
.npc-editor-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
.npc-editor-actions .field-error {
  margin: 0 auto 0 0;
}
.npc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.npc-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 12px;
}
.npc-token {
  width: 100%;
  height: 230px;
  object-fit: contain;
  border-radius: 5px;
  background: var(--paper);
}
.npc-token-empty {
  display: grid;
  place-items: center;
  color: var(--muted);
  font: 700 18px "DM Mono", monospace;
}
.npc-card-content h3 {
  margin: 0;
  overflow-wrap: anywhere;
}
.npc-facts {
  display: flex;
  gap: 10px;
  min-height: 22px;
  color: var(--muted);
  font-size: 13px;
}
.npc-rating-summary {
  margin: 0 0 12px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
}
.npc-feedback-link {
  display: inline-block;
  text-decoration: none;
}
.npc-admin-actions {
  display: flex;
  gap: 14px;
  margin-top: 12px;
}
.npc-delete {
  color: var(--error);
}
.error-state {
  display: grid;
  justify-items: center;
  gap: 12px;
}
@media (max-width: 600px) {
  .npc-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .npc-fields {
    grid-template-columns: 1fr;
  }
  .npc-token-field {
    grid-column: auto;
  }
  .npc-editor-actions {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
