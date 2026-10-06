<template>
  <div class="gallery-view">
    <div class="section-heading">
      <div>
        <span class="eyebrow">ASSET LIBRARY</span>
        <h2 class="section-title">토큰 갤러리</h2>
      </div>
      <div v-if="isGM" class="actions">
        <button class="primary-button" @click="showUrlModal = true">
          ＋ URL로 추가
        </button>
        <label class="outline-button upload-btn">
          ↑ 파일 업로드
          <input
            type="file"
            accept="image/*"
            class="hidden-input"
            @change="handleFileUpload"
          />
        </label>
      </div>
    </div>

    <!-- 팀 필터 탭 -->
    <div class="filter-tabs">
      <button
        :class="['filter-tab', { active: selectedTeamFilter === '' }]"
        @click="selectedTeamFilter = ''"
      >
        전체 보기 ({{ images.length }})
      </button>
      <button
        :class="[
          'filter-tab',
          { active: selectedTeamFilter === '__master_npcs__' },
        ]"
        @click="selectedTeamFilter = '__master_npcs__'"
      >
        마스터 NPC ({{ visibleScenarioNpcs.length }})
      </button>
      <button
        v-for="t in teams"
        :key="t.id"
        :class="['filter-tab', { active: selectedTeamFilter === t.id }]"
        @click="selectedTeamFilter = t.id"
      >
        <span class="team-dot" :style="{ background: t.color }"></span>
        {{ t.name }}
      </button>
    </div>

    <!-- 드래그 앤 드롭 영역 -->
    <div
      v-if="isGM"
      class="drop-zone"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop($event)"
    >
      <p class="muted">
        이미지 파일을 이곳으로 드래그 앤 드롭하여 업로드하세요
      </p>
    </div>

    <!-- 이미지 그리드 -->
    <p v-if="imagesLoading || (isMasterNpcTab && npcsLoading)" class="muted">
      이미지를 불러오는 중…
    </p>
    <div v-else-if="isMasterNpcTab && npcsError" class="empty-state">
      NPC 목록을 불러오지 못했습니다: {{ npcsError }}
    </div>
    <div v-else-if="isMasterNpcTab" class="gallery-grid npc-gallery-grid">
      <article
        v-for="npc in visibleScenarioNpcs"
        :key="npc.id"
        class="gallery-item card npc-gallery-card"
      >
        <router-link
          :to="{ name: 'npc-feedback', params: { npcId: npc.id } }"
          class="npc-gallery-link"
        >
          <img
            v-if="npc.token_url"
            :src="npc.token_url"
            :alt="`${npc.name} 토큰`"
          />
          <div v-else class="npc-token-placeholder">NPC</div>
          <div class="img-meta">
            <strong class="img-caption">{{ npc.name }}</strong>
            <span class="img-owner muted">{{
              [npc.age, npc.gender].filter(Boolean).join(" · ") || "정보 없음"
            }}</span>
            <span class="img-date muted">{{
              scenarioTitle(npc.scenario_step)
            }}</span>
            <span class="npc-gallery-rating">{{ ratingLabel(npc.id) }}</span>
            <span class="npc-rate-link">평점과 댓글 보기 →</span>
          </div>
        </router-link>
      </article>
      <p v-if="!visibleScenarioNpcs.length" class="empty-state">
        등록된 주요 NPC가 없습니다.
      </p>
    </div>
    <div v-else-if="imagesError" class="empty-state">
      이미지를 불러오지 못했습니다: {{ imagesError }}
    </div>
    <div v-else class="gallery-grid">
      <div
        v-for="img in filteredImages"
        :key="img.id"
        class="gallery-item card"
      >
        <div class="img-wrapper" @click="activeImage = img">
          <img :src="img.url" :alt="img.caption || '이미지'" />
          <div class="img-hover-overlay">🔍 크게 보기</div>
        </div>
        <div class="img-meta">
          <div class="img-title-row">
            <strong class="img-caption">{{
              img.caption || "캡션 없음"
            }}</strong>
            <button
              v-if="isGM"
              class="delete-button"
              title="삭제"
              @click="handleDeleteImage(img.id)"
            >
              ×
            </button>
          </div>
          <span class="img-owner muted">{{
            img.owner_label || getTeamName(img.team_id)
          }}</span>
          <span class="img-date muted">{{ formatDate(img.created_at) }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="
        !isMasterNpcTab &&
        !imagesLoading &&
        !imagesError &&
        !filteredImages.length
      "
      class="empty-state"
    >
      등록된 이미지가 없습니다.
    </div>

    <!-- URL 추가 모달 -->
    <div
      v-if="showUrlModal"
      class="modal-overlay"
      @click.self="showUrlModal = false"
    >
      <div class="modal">
        <div class="modal-head">
          <h3>이미지 URL 추가</h3>
          <button class="delete-button" @click="showUrlModal = false">×</button>
        </div>
        <div class="modal-body">
          <label class="form-label">
            이미지 URL
            <input
              v-model="newImage.url"
              class="form-input"
              placeholder="https://..."
              required
            />
          </label>
          <label class="form-label">
            캡션 (설명)
            <input
              v-model="newImage.caption"
              class="form-input"
              placeholder="예: 잿빛 길목의 풍경"
            />
          </label>

          <label class="form-label">
            소속 팀
            <select v-model="newImage.team_id" class="form-input">
              <option value="">공용 자산</option>
              <option v-for="t in teams" :key="t.id" :value="t.id">
                {{ t.name }}
              </option>
            </select>
          </label>
          <label class="form-label">
            소유자 라벨
            <input
              v-model="newImage.owner_label"
              class="form-input"
              placeholder="예: 공용 자료, 회색 감시자"
            />
          </label>
        </div>
        <div class="modal-foot">
          <button class="secondary-button" @click="showUrlModal = false">
            취소
          </button>
          <button
            class="primary-button"
            :disabled="saving"
            @click="handleAddUrlImage"
          >
            {{ saving ? "추가 중..." : "추가" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 이미지 확대 라이트박스 -->
    <div
      v-if="activeImage"
      class="lightbox-overlay"
      @click.self="activeImage = null"
    >
      <div class="lightbox-card">
        <button class="close-lightbox" @click="activeImage = null">×</button>
        <img :src="activeImage.url" :alt="activeImage.caption" />
        <div class="lightbox-caption">
          <h3>{{ activeImage.caption || "이미지" }}</h3>
          <p class="muted">
            {{ activeImage.owner_label || getTeamName(activeImage.team_id) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  getCampaignImages,
  getPlayerTeamGalleryImages,
  includeCurrentCharacterTokens,
  saveImage,
  deleteImage,
  uploadGalleryImage,
} from "@/services/images";
import { supabase } from "@/supabase";
import { formatNpcRating, getNpcRatingSummaries } from "@/services/npcRatings";

export default {
  name: "GalleryView",
  data() {
    return {
      images: [],
      scenarioNpcs: [],
      npcRatingSummaries: {},
      npcRatingsError: "",
      npcsLoading: false,
      npcsError: null,
      imagesLoading: false,
      imagesError: null,
      selectedTeamFilter: "",
      showUrlModal: false,
      isDragging: false,
      saving: false,
      activeImage: null,
      newImage: { url: "", caption: "", team_id: "", owner_label: "" },
    };
  },
  computed: {
    isGM() {
      return this.$store.getters.isGM;
    },
    isMaster() {
      return this.$store.getters.isMaster;
    },
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    playerTeamId() {
      return this.$store.getters.activePlayerTeamId;
    },
    teams() {
      return this.$store.getters.sortedTeams;
    },
    campaignId() {
      return this.$store.getters.campaignId;
    },
    isMasterNpcTab() {
      return this.selectedTeamFilter === "__master_npcs__";
    },
    filteredImages() {
      if (!this.selectedTeamFilter) return this.images;
      return this.images.filter(
        (img) => img.team_id === this.selectedTeamFilter
      );
    },
    visibleScenarioNpcs() {
      if (!this.isPlayerPreview) return this.scenarioNpcs;
      const team = this.teams.find((item) => item.id === this.playerTeamId);
      const visibleStep = Math.max((Number(team?.progress_step) || 1) - 1, 0);
      return this.scenarioNpcs.filter(
        (npc) => Number(npc.scenario_step) <= visibleStep
      );
    },
  },
  async mounted() {
    const requestedTeam = String(this.$route.query.teamId || "");
    this.selectedTeamFilter = this.teams.some(
      (team) => team.id === requestedTeam
    )
      ? requestedTeam
      : "";
    await Promise.all([this.loadImages(), this.loadScenarioNpcs()]);
  },
  watch: {
    isPlayerPreview(enabled) {
      if (enabled) this.showUrlModal = false;
    },
    "$store.state.teams": {
      deep: true,
      handler() {
        if (this.campaignId && (this.isGM || this.playerTeamId)) {
          this.loadImages();
          this.loadScenarioNpcs();
        }
      },
    },
    playerTeamId(teamId) {
      if ((!this.isGM || this.isPlayerPreview) && teamId) {
        this.loadImages();
        this.loadScenarioNpcs();
      }
    },
    campaignId(campaignId) {
      if (campaignId && (this.isGM || this.playerTeamId)) {
        this.loadImages();
        this.loadScenarioNpcs();
      }
    },
  },
  methods: {
    async loadScenarioNpcs() {
      if (!this.campaignId) return;
      this.npcsLoading = true;
      this.npcsError = null;
      const { data, error } = await supabase
        .from("scenario_npcs")
        .select("id, scenario_step, name, age, gender, token_url")
        .eq("campaign_id", this.campaignId)
        .order("scenario_step", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        this.scenarioNpcs = [];
        this.npcsError = error.message;
      } else {
        this.scenarioNpcs = data || [];
        try {
          this.npcRatingSummaries = await getNpcRatingSummaries(
            this.scenarioNpcs.map((npc) => npc.id)
          );
          this.npcRatingsError = "";
        } catch (ratingError) {
          this.npcRatingSummaries = {};
          this.npcRatingsError = ratingError.message;
        }
      }
      this.npcsLoading = false;
    },
    ratingLabel(npcId) {
      return this.npcRatingsError
        ? "평점 확인 불가"
        : formatNpcRating(this.npcRatingSummaries[npcId]);
    },
    scenarioTitle(stepNumber) {
      const stage = (this.$store.state.progressStages || []).find(
        (item) => Number(item.step_number) === Number(stepNumber)
      );
      return stage?.title || stage?.name || `시나리오 ${stepNumber}`;
    },
    async loadImages() {
      if (this.isGM && !this.campaignId) return;
      if (!this.isGM && !this.playerTeamId) return;
      this.imagesLoading = true;
      this.imagesError = null;
      try {
        if (this.isMaster) {
          const campaignImages = await getCampaignImages(this.campaignId);
          this.images = includeCurrentCharacterTokens(
            campaignImages,
            this.teams
          );
        } else {
          this.images = await getPlayerTeamGalleryImages(
            this.playerTeamId,
            this.campaignId,
            this.teams
          );
        }
      } catch (error) {
        this.images = [];
        this.imagesError = error.message || String(error);
      } finally {
        this.imagesLoading = false;
      }
    },
    getTeamName(teamId) {
      if (!teamId) return "공용 자산";
      const t = this.teams.find((item) => item.id === teamId);
      return t ? t.name : "공용 자산";
    },
    formatDate(isoStr) {
      if (!isoStr) return "";
      return new Date(isoStr).toLocaleDateString("ko-KR");
    },
    async handleAddUrlImage() {
      if (!this.isGM) return;
      if (!this.newImage.url.trim()) return;
      this.saving = true;
      try {
        const saved = await saveImage({
          campaignId: this.campaignId,
          teamId: this.newImage.team_id || null,
          url: this.newImage.url,
          caption: this.newImage.caption,
          ownerLabel: this.newImage.owner_label,
        });
        this.images.unshift(saved);
        this.$store.dispatch("showToast", {
          message: "이미지가 추가되었습니다.",
          type: "success",
        });
        this.showUrlModal = false;
        this.newImage = { url: "", caption: "", team_id: "", owner_label: "" };
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "추가 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.saving = false;
      }
    },
    async handleFileUpload(e) {
      if (!this.isGM) return;
      const file = e.target.files[0];
      if (file) await this.uploadFile(file);
    },
    async handleDrop(e) {
      if (!this.isGM) return;
      this.isDragging = false;
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        await this.uploadFile(file);
      }
    },
    async uploadFile(file) {
      try {
        const url = await uploadGalleryImage(
          file,
          this.campaignId,
          this.selectedTeamFilter || null
        );
        const saved = await saveImage({
          campaignId: this.campaignId,
          teamId: this.selectedTeamFilter || null,
          url,
          caption: file.name,
          ownerLabel: this.selectedTeamFilter
            ? this.getTeamName(this.selectedTeamFilter)
            : "공용 자료",
        });
        this.images.unshift(saved);
        this.$store.dispatch("showToast", {
          message: "이미지가 업로드되었습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "업로드 실패: " + error.message,
          type: "error",
        });
      }
    },
    async handleDeleteImage(id) {
      if (!this.isGM) return;
      if (!confirm("이미지를 삭제하시겠습니까?")) return;
      try {
        await deleteImage(id);
        this.images = this.images.filter((img) => img.id !== id);
        this.$store.dispatch("showToast", {
          message: "이미지가 삭제되었습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "삭제 실패: " + error.message,
          type: "error",
        });
      }
    },
  },
};
</script>

<style scoped>
/* 토큰 갤러리의 필터, 그리드, 미리 보기 화면에 적용됩니다. */
.gallery-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.actions {
  display: flex;
  gap: 10px;
}
.upload-btn {
  cursor: pointer;
}
.hidden-input {
  display: none;
}

.filter-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.filter-tab.active {
  border-color: var(--accent);
  background: rgba(201, 121, 84, 0.08);
  color: var(--accent);
}
.team-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.drop-zone {
  border: 2px dashed var(--line);
  border-radius: 4px;
  padding: 24px;
  text-align: center;
  background: var(--paper);
  transition: all 0.15s;
}
.drop-zone.dragging {
  border-color: var(--accent);
  background: rgba(201, 121, 84, 0.05);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.gallery-item {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.npc-gallery-card {
  height: 100%;
}
.npc-gallery-link {
  display: flex;
  flex: 1;
  flex-direction: column;
  color: inherit;
  text-decoration: none;
}
.npc-gallery-link > img,
.npc-token-placeholder {
  width: 100%;
  height: 180px;
  object-fit: contain;
  background: var(--paper);
}
.npc-token-placeholder {
  display: grid;
  place-items: center;
  color: var(--muted);
  font: 700 18px "DM Mono", monospace;
}
.npc-rate-link {
  margin-top: 8px;
  color: var(--accent);
  font-size: 12px;
}
.npc-gallery-rating {
  margin-top: 5px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
}
.img-wrapper {
  position: relative;
  height: 160px;
  cursor: pointer;
  overflow: hidden;
  background: #000;
}
.img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}
.img-wrapper:hover img {
  transform: scale(1.04);
  opacity: 0.85;
}
.img-hover-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.2s;
}
.img-wrapper:hover .img-hover-overlay {
  opacity: 1;
}

.img-meta {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.img-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.img-caption {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.img-owner {
  font-size: 12px;
}
.img-date {
  font-size: 11px;
}

.modal-overlay,
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
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
  max-width: 440px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}
.modal-head h3 {
  margin: 0;
  font-size: 16px;
}
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-foot {
  padding: 14px 20px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.lightbox-card {
  position: relative;
  max-width: 80vw;
  max-height: 80vh;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}
.lightbox-card img {
  max-width: 100%;
  max-height: 70vh;
  display: block;
  object-fit: contain;
  margin: 0 auto;
}
.lightbox-caption {
  padding: 16px;
  background: var(--panel);
}
.lightbox-caption h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.close-lightbox {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  font-size: 24px;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  cursor: pointer;
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--muted);
  font-size: 14px;
}

@media (max-width: 600px) {
  .gallery-view {
    gap: 16px;
  }
  .section-heading {
    align-items: flex-start;
    gap: 12px;
  }
  .actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .filter-tabs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 6px;
    -webkit-overflow-scrolling: touch;
  }
  .filter-tab {
    flex: 0 0 auto;
    min-height: 40px;
    white-space: nowrap;
  }
  .drop-zone {
    padding: 18px 14px;
  }
  .gallery-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .img-wrapper {
    height: clamp(120px, 38vw, 180px);
  }
  .img-hover-overlay {
    display: none;
  }
  .img-meta {
    padding: 9px;
  }
  .img-caption {
    font-size: 12px;
  }
  .img-owner {
    font-size: 11px;
  }
  .modal-overlay,
  .lightbox-overlay {
    padding: 12px;
  }
  .modal {
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
  }
  .modal-head,
  .modal-body,
  .modal-foot {
    padding-inline: 14px;
  }
  .modal-foot {
    flex-wrap: wrap;
  }
  .lightbox-card {
    max-width: 100%;
    max-height: 90dvh;
  }
  .lightbox-card img {
    max-height: 72dvh;
  }
  .empty-state {
    padding: 28px 16px;
  }
}

@media (max-width: 360px) {
  .gallery-grid {
    grid-template-columns: 1fr;
  }
  .img-wrapper {
    height: 210px;
  }
  .section-heading {
    flex-direction: column;
  }
  .actions {
    justify-content: flex-start;
  }
}
</style>
