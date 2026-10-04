<template>
  <div v-if="character" class="character-detail-view">
    <div class="section-heading">
      <div>
        <span class="eyebrow">CHARACTER PROFILE</span>
        <h2 class="section-title">{{ character.character_name || "이름 없음" }}</h2>
      </div>
      <div class="header-actions">
        <button class="primary-button" :disabled="saving" @click="handleSave">
          {{ saving ? "저장 중..." : "저장" }}
        </button>
        <button class="danger-button" @click="handleDelete">삭제</button>
      </div>
    </div>

    <div class="sheet-layout">
      <!-- 좌측 프로필 카드 & 토큰 업로드 -->
      <div class="profile-sidebar card">
        <div class="avatar-wrapper">
          <div class="large-token" :style="{ backgroundColor: teamColor }">
            <img
              v-if="character.token_url && !tokenImageFailed"
              :src="character.token_url"
              class="large-token-image"
              alt="Character token"
              @error="tokenImageFailed = true"
            />
            <span v-if="!character.token_url || tokenImageFailed">{{
              (character.character_name || "?")[0]
            }}</span>
          </div>
          <label class="upload-btn outline-button">
            이미지 변경
            <input
              type="file"
              accept="image/*"
              class="hidden-file-input"
              @change="handleTokenUpload"
            />
          </label>
          <div v-if="tokenHistory.length" class="token-history">
            <div class="token-history-head">
              <span class="muted"
                >이전 토큰 {{ tokenCursor + 1 }}/{{ tokenHistory.length }}</span
              >
              <div class="token-history-controls">
                <button
                  class="outline-button"
                  type="button"
                  aria-label="이전 이미지"
                  @click="moveToken(-1)"
                >
                  ‹
                </button>
                <button
                  class="outline-button"
                  type="button"
                  aria-label="다음 이미지"
                  @click="moveToken(1)"
                >
                  ›
                </button>
              </div>
            </div>
            <button
              class="token-history-preview"
              type="button"
              @click="selectHistoryToken"
            >
              <img
                :src="tokenHistory[tokenCursor].url"
                alt="이전 토큰 미리보기"
              />
              <span>이 이미지 선택</span>
            </button>
          </div>
          <button
            v-if="character.token_url"
            class="text-button remove-token"
            @click="character.token_url = ''"
          >
            토큰 제거
          </button>
        </div>

        <div class="profile-fields">
          <label class="form-label">
            로그인 아이디 (username)
            <input v-model="character.username" class="form-input" required />
          </label>
          <label class="form-label">
            캐릭터 이름
            <input v-model="character.character_name" class="form-input" required />
          </label>
          <label class="form-label">
            PL (플레이어 이름)
            <input v-model="character.player" class="form-input" />
          </label>
          <label class="form-label">
            소속 팀
            <select v-model="character.team_id" class="form-input">
              <option v-for="t in teams" :key="t.id" :value="t.id">
                {{ t.name }}
              </option>
            </select>
          </label>
          <label class="form-label">
            토큰 이미지 URL
            <input
              v-model="character.token_url"
              class="form-input"
              placeholder="https://..."
            />
          </label>
        </div>
      </div>

      <!-- 우측 상세 메타데이터 & 시트 폼 -->
      <div class="sheet-main card">
        <h3>기본 인적 사항</h3>
        <div class="form-grid-4">
          <label class="form-label"
            >레벨
            <input
              v-model.number="character.level"
              type="number"
              min="1"
              class="form-input"
          /></label>
          <label class="form-label"
            >종족 <input v-model="character.race" class="form-input"
          /></label>
          <label class="form-label"
            >클래스 <input v-model="character.class" class="form-input"
          /></label>
          <label class="form-label"
            >사회 계층
            <input v-model="character.social_class" class="form-input"
          /></label>
          <label class="form-label"
            >배경 <input v-model="character.background" class="form-input"
          /></label>
          <label class="form-label"
            >나이 <input v-model="character.age" class="form-input"
          /></label>
          <label class="form-label"
            >키 <input v-model="character.height" class="form-input"
          /></label>
          <label class="form-label"
            >몸무게 <input v-model="character.weight" class="form-input"
          /></label>
        </div>

        <h3 class="section-divider">세부 세팅 및 특징</h3>
        <div class="form-grid-2">
          <label class="form-label"
            >동기
            <textarea
              v-model="character.motivation"
              class="form-textarea"
              placeholder="움직이게 만드는 이유"
            ></textarea>
          </label>
          <label class="form-label"
            >목표
            <textarea
              v-model="character.goal"
              class="form-textarea"
              placeholder="이루고자 하는 목표"
            ></textarea>
          </label>
          <label class="form-label"
            >장점
            <textarea
              v-model="character.strengths"
              class="form-textarea"
              placeholder="강점 및 장점"
            ></textarea>
          </label>
          <label class="form-label"
            >파멸
            <textarea
              v-model="character.doom"
              class="form-textarea"
              placeholder="피하고 싶은 운명"
            ></textarea>
          </label>
          <label class="form-label"
            >언어
            <input
              v-model="character.languages"
              class="form-input"
              placeholder="구사 가능한 언어"
          /></label>
          <label class="form-label"
            >특징
            <input
              v-model="character.traits"
              class="form-input"
              placeholder="눈에 띄는 특징"
          /></label>
        </div>

        <h3 class="section-divider">전기</h3>
        <label class="form-label">
          캐릭터 소개
          <textarea
            v-model="character.biography"
            class="form-textarea large-textarea"
            placeholder="캐릭터 배경 및 전기 내용"
          ></textarea>
        </label>

        <h3 class="section-divider gm-title">GM 전용 메모</h3>
        <div class="gm-memo-box">
          <label class="form-label">
            GM 비밀 메모 (플레이어 비공개)
            <textarea
              v-model="character.gm_secret"
              class="form-textarea"
              placeholder="GM만 볼 수 있는 비밀 설정"
            ></textarea>
          </label>
          <label class="form-label">
            플레이어 & GM 공통 비밀 메모
            <textarea
              v-model="character.player_gm_secret"
              class="form-textarea"
              placeholder="플레이어와 GM 간 공유하는 비밀 메모"
            ></textarea>
          </label>
          <label class="form-label">
            캐릭터를 관통하는 키워드와 신념
            <textarea v-model="character.gm_core_belief" class="form-textarea" placeholder="캐릭터를 움직이는 핵심 키워드와 신념"></textarea>
          </label>
          <label class="form-label">
            가장 후회하는 일
            <textarea v-model="character.gm_regret" class="form-textarea" placeholder="캐릭터가 가장 후회하는 일"></textarea>
          </label>
          <label class="form-label">
            가장 소중한 사람
            <textarea v-model="character.gm_cherished_person" class="form-textarea" placeholder="가장 소중한 사람과 그 이유"></textarea>
          </label>
          <label class="form-label">
            가장 원하는 것
            <textarea v-model="character.gm_desire" class="form-textarea" placeholder="캐릭터가 가장 원하는 것"></textarea>
          </label>
          <label class="form-label">
            가장 두려운 것
            <textarea v-model="character.gm_fear" class="form-textarea" placeholder="캐릭터가 가장 두려워하는 것"></textarea>
          </label>
          <label class="form-label">
            아무도 모르는 비밀
            <textarea v-model="character.gm_unknown_secret" class="form-textarea" placeholder="아직 누구에게도 밝히지 않은 비밀"></textarea>
          </label>
          <label class="form-label">
            등장하거나 언급되길 바라는 과거사
            <textarea v-model="character.gm_backstory_hooks" class="form-textarea" placeholder="등장하면 좋거나 언급되길 바라는 인물, 사건, 장소 등"></textarea>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  getCharacter,
  saveCharacter,
  deleteCharacter,
  uploadTokenImage,
  getTokenImageHistory,
} from "@/services/characters";

export default {
  name: "CharacterDetailView",
  props: {
    characterId: { type: String, required: true },
  },
  data() {
    return {
      character: null,
      saving: false,
      tokenHistory: [],
      tokenCursor: 0,
      tokenImageFailed: false,
    };
  },
  computed: {
    teams() {
      return this.$store.getters.sortedTeams;
    },
    teamColor() {
      const t = this.teams.find((item) => item.id === this.character?.team_id);
      return t ? t.color : "#8b7aa8";
    },
  },
  async mounted() {
    await this.loadCharacter();
  },
  watch: {
    "character.token_url"() {
      this.tokenImageFailed = false;
    },
  },
  methods: {
    async loadCharacter() {
      try {
        const data = await getCharacter(this.characterId);
        this.character = data;
        await this.loadTokenHistory();
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "캐릭터를 불러올 수 없습니다: " + error.message,
          type: "error",
        });
      }
    },
    async handleSave() {
      this.saving = true;
      try {
        const saved = await saveCharacter(this.character);
        this.character = saved;
        // 스토어 업데이트
        const team = this.teams.find((t) => t.id === saved.team_id);
        if (team) {
          const updatedChars = (team.characters || []).map((c) =>
            c.id === saved.id ? saved : c
          );
          this.$store.commit("updateTeam", {
            ...team,
            characters: updatedChars,
          });
        }
        this.$store.dispatch("showToast", {
          message: "캐릭터 정보가 저장되었습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "저장 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.saving = false;
      }
    },
    async handleDelete() {
      if (
        !confirm(`'${this.character.character_name}' 캐릭터를 정말 삭제하시겠습니까?`)
      )
        return;
      try {
        await deleteCharacter(this.characterId);
        // 스토어 팀 목록에서 삭제
        const team = this.teams.find((t) => t.id === this.character.team_id);
        if (team) {
          const updatedChars = (team.characters || []).filter(
            (c) => c.id !== this.characterId
          );
          this.$store.commit("updateTeam", {
            ...team,
            characters: updatedChars,
          });
        }
        this.$store.dispatch("showToast", {
          message: "캐릭터가 삭제되었습니다.",
          type: "success",
        });
        this.$router.push("/characters");
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "삭제 실패: " + error.message,
          type: "error",
        });
      }
    },
    async handleTokenUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await uploadTokenImage(
          file,
          this.character.team_id || "common",
          this.characterId,
          this.$store.getters.campaignId,
          this.character.character_name || ""
        );
        this.character.token_url = url;
        await this.loadTokenHistory();
        this.tokenCursor = 0;
        this.$store.dispatch("showToast", {
          message: "토큰 이미지가 업로드되었습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "업로드 실패: " + error.message,
          type: "error",
        });
      } finally {
        e.target.value = "";
      }
    },
    async loadTokenHistory() {
      this.tokenHistory = await getTokenImageHistory(this.characterId);
      if (this.tokenCursor >= this.tokenHistory.length) this.tokenCursor = 0;
    },
    moveToken(direction) {
      if (!this.tokenHistory.length) return;
      this.tokenCursor =
        (this.tokenCursor + direction + this.tokenHistory.length) %
        this.tokenHistory.length;
    },
    selectHistoryToken() {
      const selected = this.tokenHistory[this.tokenCursor];
      if (!selected) return;
      this.character.token_url = selected.url;
      this.$store.dispatch("showToast", {
        message: "토큰을 선택했습니다. 저장 버튼을 눌러 적용하세요.",
        type: "success",
      });
    },
  },
};
</script>

<style scoped>
/* 개별 캐릭터 상세 정보와 편집 화면에 적용됩니다. */
.character-detail-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.header-actions {
  display: flex;
  gap: 10px;
}

.sheet-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  align-items: start;
}

.profile-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.avatar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.large-token {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 40px;
  font-weight: 800;
  border: 2px solid var(--line);
  background-color: var(--line);
  overflow: hidden;
  position: relative;
}
.large-token-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.hidden-file-input {
  display: none;
}
.upload-btn {
  cursor: pointer;
  font-size: 12px;
}
.remove-token {
  font-size: 12px;
  color: var(--error);
}
.token-history {
  width: 100%;
  max-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.token-history-head,
.token-history-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.token-history-controls .outline-button {
  min-width: 32px;
  padding: 4px 9px;
}
.token-history-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
}
.token-history-preview img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 50%;
}

.profile-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sheet-main h3 {
  font-size: 16px;
  margin: 0;
}
.section-divider {
  border-top: 1px solid var(--line);
  padding-top: 16px;
  margin-top: 8px;
}
.gm-title {
  color: var(--accent);
}

.form-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.form-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.col-span-2 {
  grid-column: span 2;
}
.large-textarea {
  min-height: 120px;
}

.gm-memo-box {
  background: rgba(201, 121, 84, 0.04);
  border: 1px dashed rgba(201, 121, 84, 0.3);
  padding: 16px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 900px) {
  .sheet-layout {
    grid-template-columns: 1fr;
  }
  .form-grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .form-grid-4,
  .form-grid-2 {
    grid-template-columns: 1fr;
  }
  .col-span-2 {
    grid-column: span 1;
  }
}
</style>
