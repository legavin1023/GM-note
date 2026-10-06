<template>
  <div class="characters-view">
    <div class="section-heading">
      <div>
        <span class="eyebrow">CHARACTERS</span>
        <h2 class="section-title">전체 캐릭터 목록</h2>
      </div>
      <div class="actions">
        <select v-model="selectedTeamFilter" class="form-input filter-select">
          <option value="">모든 팀 보기</option>
          <option v-for="team in teams" :key="team.id" :value="team.id">
            {{ team.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="characters-grid">
      <component
        :is="isGM ? 'router-link' : 'div'"
        v-for="char in filteredCharacters"
        :key="char.id"
        :to="isGM ? '/characters/' + char.id : undefined"
        class="character-card card"
        :class="{ 'character-card--interactive': !isGM }"
        @click="!isGM && (selectedCharacter = char)"
      >
        <div
          class="char-avatar"
          :style="{ backgroundColor: getTeamColor(char.team_id) }"
        >
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
        <div class="char-details">
          <div class="char-name-row">
            <h3>{{ char.character_name || "이름 없음" }}</h3>
            <span
              class="team-badge"
              :style="{ borderColor: getTeamColor(char.team_id) }"
            >
              {{ getTeamName(char.team_id) }}
            </span>
          </div>
          <p class="char-sub muted">
            PL: {{ char.player || "홍길동" }} · Lv.{{ char.level || 1 }}
          </p>
          <p class="char-meta muted">
            {{ char.race || "종족미정" }} {{ char.class || "클래스미정" }}
          </p>
        </div>
        <span class="card-arrow">↗</span>
      </component>
    </div>

    <div v-if="!filteredCharacters.length" class="empty-state">
      등록된 캐릭터가 없습니다. 팀 상세 페이지에서 캐릭터를 추가하세요.
    </div>
  </div>
  <div
    v-if="selectedCharacter && !isGM"
    class="modal-overlay"
    @click.self="selectedCharacter = null"
  >
    <section class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div>
          <span class="eyebrow">{{
            getTeamName(selectedCharacter.team_id)
          }}</span>
          <h3>
            {{ selectedCharacter.character_name || "캐릭터 이름 미입력" }}
          </h3>
        </div>
        <button
          class="delete-button"
          aria-label="닫기"
          @click="selectedCharacter = null"
        >
          ×
        </button>
      </div>
      <div class="profile-content">
        <dl class="profile-grid">
          <div
            v-for="field in profileFields"
            :key="field.key"
            :class="{ 'profile-grid__intro': field.key === 'biography' }"
          >
            <dt>{{ field.label }}</dt>
            <dd>{{ selectedCharacter[field.key] || "미입력" }}</dd>
          </div>
        </dl>
        <div v-if="isOwnSelectedCharacter" class="player-character-edit">
          <p v-if="characterChangeStatus?.status === 'pending'" class="muted">
            수정 요청을 GM이 검토 중입니다.
          </p>
          <button
            v-if="
              !editingCharacter && characterChangeStatus?.status !== 'pending'
            "
            class="outline-button"
            type="button"
            @click="beginCharacterEdit"
          >
            내 캐릭터 수정 요청
          </button>
          <form
            v-if="editingCharacter"
            class="player-character-edit-form"
            @submit.prevent="submitCharacterEdit"
          >
            <h4>변경 요청 내용</h4>
            <label
              v-for="field in editableFields"
              :key="field.key"
              class="form-label"
            >
              {{ field.label }}
              <textarea
                v-if="field.multiline"
                v-model="characterDraft[field.key]"
                class="form-textarea"
                rows="3"
              ></textarea>
              <input
                v-else
                v-model="characterDraft[field.key]"
                class="form-input"
                :type="field.type || 'text'"
                :min="field.type === 'number' ? 1 : undefined"
                :required="field.required || undefined"
              />
            </label>
            <div class="header-actions">
              <button
                class="secondary-button"
                type="button"
                @click="editingCharacter = false"
              >
                취소
              </button>
              <button
                class="primary-button"
                type="submit"
                :disabled="savingCharacterChange"
              >
                {{ savingCharacterChange ? "요청 중…" : "GM에게 승인 요청" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import {
  getPlayerCharacterChangeStatus,
  submitPlayerCharacterChange,
} from "@/services/playerCharacterChanges";

export default {
  name: "CharactersView",
  data() {
    return {
      selectedTeamFilter: "",
      imageErrors: {},
      selectedCharacter: null,
      editingCharacter: false,
      savingCharacterChange: false,
      characterDraft: {},
      characterChangeStatus: null,
    };
  },
  computed: {
    isGM() {
      return this.$store.getters.isGM;
    },
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    playerTeamId() {
      return this.$store.getters.activePlayerTeamId;
    },
    playerCharacterId() {
      return this.$store.state.playerCharacterId;
    },
    isOwnSelectedCharacter() {
      return Boolean(
        !this.isGM &&
          !this.isPlayerPreview &&
          this.selectedCharacter &&
          this.selectedCharacter.id === this.playerCharacterId
      );
    },
    editableFields() {
      return [
        { key: "character_name", label: "캐릭터 이름" },
        { key: "age", label: "나이" },
        { key: "height", label: "키" },
        { key: "weight", label: "몸무게" },
        { key: "race", label: "종족" },
        { key: "background", label: "배경", multiline: true },
        { key: "social_class", label: "사회 계층" },
        { key: "class", label: "직업" },
        { key: "level", label: "레벨", type: "number", required: true },
        { key: "motivation", label: "동기", multiline: true },
        { key: "goal", label: "목표", multiline: true },
        { key: "strengths", label: "강점", multiline: true },
        { key: "languages", label: "언어" },
        { key: "traits", label: "특징" },
        { key: "character_quirk", label: "특이 사항", multiline: true },
        { key: "biography", label: "소개", multiline: true },
        { key: "token_url", label: "토큰 이미지 주소" },
      ];
    },
    profileFields() {
      return [
        { key: "player", label: "플레이어" },
        { key: "age", label: "나이" },
        { key: "height", label: "키" },
        { key: "weight", label: "몸무게" },
        { key: "race", label: "종족" },
        { key: "class", label: "직업" },
        { key: "level", label: "레벨" },
        { key: "background", label: "배경" },
        { key: "social_class", label: "사회 계층" },
        { key: "motivation", label: "동기" },
        { key: "goal", label: "목표" },
        { key: "strengths", label: "강점" },
        { key: "languages", label: "언어" },
        { key: "traits", label: "특징" },
        { key: "character_quirk", label: "특이 사항" },
        { key: "biography", label: "소개" },
      ];
    },
    teams() {
      return this.$store.getters.sortedTeams;
    },
    allCharacters() {
      return this.teams.flatMap((t) =>
        (t.characters || []).map((c) => ({ ...c, team_id: t.id }))
      );
    },
    filteredCharacters() {
      if (!this.selectedTeamFilter) return this.allCharacters;
      return this.allCharacters.filter(
        (character) => character.team_id === this.selectedTeamFilter
      );
    },
  },
  watch: {
    isPlayerPreview(enabled) {
      if (enabled) {
        this.selectedTeamFilter = "";
        this.selectedCharacter = null;
      }
    },
    selectedCharacter(character) {
      if (!character) {
        this.editingCharacter = false;
        this.characterChangeStatus = null;
        this.characterDraft = {};
      }
    },
  },
  methods: {
    async beginCharacterEdit() {
      if (!this.isOwnSelectedCharacter) return;
      this.savingCharacterChange = true;
      try {
        this.characterChangeStatus = await getPlayerCharacterChangeStatus();
        if (this.characterChangeStatus?.status === "pending") return;
        this.characterDraft = Object.fromEntries(
          this.editableFields.map(({ key }) => [
            key,
            this.selectedCharacter[key] ?? "",
          ])
        );
        this.editingCharacter = true;
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "수정 요청 상태를 불러오지 못했습니다: " + error.message,
          type: "error",
        });
      } finally {
        this.savingCharacterChange = false;
      }
    },
    async submitCharacterEdit() {
      if (!this.isOwnSelectedCharacter || this.savingCharacterChange) return;
      const changes = {};
      for (const { key, type } of this.editableFields) {
        const nextValue = this.characterDraft[key];
        const previousValue = this.selectedCharacter[key] ?? "";
        if (String(nextValue) === String(previousValue)) continue;
        changes[key] = type === "number" ? Number(nextValue) : nextValue;
      }
      if (!Object.keys(changes).length) {
        this.editingCharacter = false;
        return;
      }

      this.savingCharacterChange = true;
      try {
        await submitPlayerCharacterChange(changes);
        this.characterChangeStatus = {
          status: "pending",
          requested_changes: changes,
        };
        this.editingCharacter = false;
        this.$store.dispatch("showToast", {
          message: "변경 요청을 GM에게 보냈습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "변경 요청을 보내지 못했습니다: " + error.message,
          type: "error",
        });
      } finally {
        this.savingCharacterChange = false;
      }
    },
    markImageError(characterId) {
      this.imageErrors = { ...this.imageErrors, [characterId]: true };
    },
    getTeamName(teamId) {
      const t = this.teams.find((item) => item.id === teamId);
      return t ? t.name : "팀 미정";
    },
    getTeamColor(teamId) {
      const t = this.teams.find((item) => item.id === teamId);
      return t ? t.color : "#b42332";
    },
  },
};
</script>

<style scoped>
/* 캐릭터 목록, 검색 및 캐릭터 카드 화면에 적용됩니다. */
.characters-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.actions {
  display: flex;
  gap: 12px;
}
.filter-select {
  font-size: 13px;
  min-width: 180px;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.character-card {
  display: flex;
  align-items: center;
  gap: 16px;
  text-decoration: none;
  color: var(--ink);
  transition: border-color 0.15s, transform 0.1s;
  padding: 18px;
}
.character-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.character-card--interactive {
  cursor: pointer;
}
.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 0;
}
.profile-content {
  padding: 16px 20px 20px;
}
.profile-grid > div {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
}
.profile-grid__intro {
  grid-column: 1 / -1;
}
.profile-grid dt {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 5px;
}
.profile-grid dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.player-character-edit {
  display: grid;
  gap: 14px;
  padding: 20px 24px 24px;
}
.player-character-edit-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.player-character-edit-form h4,
.player-character-edit-form .header-actions {
  grid-column: 1 / -1;
}
.char-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 800;
  font-size: 20px;
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
.char-details {
  flex: 1;
  min-width: 0;
}
.char-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.char-name-row h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.team-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 99px;
  border: 1px solid var(--line);
  color: var(--muted);
  flex-shrink: 0;
}
.char-sub {
  font-size: 12px;
  margin: 0 0 2px;
}
.char-meta {
  font-size: 12px;
  margin: 0;
}
.card-arrow {
  color: var(--muted);
  font-size: 16px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  padding: 20px;
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
  width: min(900px, 100%);
  max-width: 900px;
  max-height: min(90vh, 960px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--line);
}
.modal-head h3 {
  margin: 4px 0 0;
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--muted);
  font-size: 14px;
}

@media (max-width: 600px) {
  .characters-view {
    gap: 16px;
  }
  .section-heading {
    align-items: flex-start;
    gap: 12px;
  }
  .actions {
    flex-wrap: wrap;
  }
  .filter-select {
    min-width: 0;
    max-width: 100%;
  }
  .characters-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .character-card {
    gap: 12px;
    padding: 14px;
  }
  .profile-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .player-character-edit {
    padding: 16px;
  }
  .player-character-edit-form {
    grid-template-columns: 1fr;
  }
  .modal-overlay {
    align-items: flex-end;
    padding: 0 0 env(safe-area-inset-bottom);
    background: rgba(0, 0, 0, 0.58);
  }
  .modal {
    width: 100%;
    max-width: none;
    max-height: min(90dvh, 820px);
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 18px 18px 0 0;
    overflow-y: auto;
  }
  .modal-head {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--panel);
    padding: 14px 16px 12px;
  }
  .memory-tabs {
    position: sticky;
    top: 68px;
    z-index: 1;
    margin: 0;
    padding: 0 16px;
    background: var(--panel);
  }
  .memory-tab {
    min-height: 44px;
  }
  .player-character-edit {
    padding: 14px 16px 18px;
  }
  .empty-state {
    padding: 28px 16px;
  }
}
</style>
