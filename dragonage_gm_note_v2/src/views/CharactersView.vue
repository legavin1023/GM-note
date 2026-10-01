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
      <router-link
        v-for="char in filteredCharacters"
        :key="char.id"
        :to="'/characters/' + char.id"
        class="character-card card"
      >
        <div class="char-avatar" :style="{ backgroundColor: getTeamColor(char.team_id) }">
          <img
            v-if="char.token_url && !imageErrors[char.id]"
            :src="char.token_url"
            class="char-avatar-image"
            :alt="char.username || 'Character token'"
            @error="markImageError(char.id)"
          />
          <span v-if="!char.token_url || imageErrors[char.id]">{{ (char.username || '?')[0] }}</span>
        </div>
        <div class="char-details">
          <div class="char-name-row">
            <h3>{{ char.username || '이름 없음' }}</h3>
            <span class="team-badge" :style="{ borderColor: getTeamColor(char.team_id) }">
              {{ getTeamName(char.team_id) }}
            </span>
          </div>
          <p class="char-sub muted">
            PL: {{ char.player || '홍길동' }} · Lv.{{ char.level || 1 }}
          </p>
          <p class="char-meta muted">
            {{ char.race || '종족미정' }} {{ char.class || '클래스미정' }}
          </p>
        </div>
        <span class="card-arrow">↗</span>
      </router-link>
    </div>

    <div v-if="!filteredCharacters.length" class="empty-state">
      등록된 캐릭터가 없습니다. 팀 상세 페이지에서 캐릭터를 추가하세요.
    </div>
  </div>
</template>

<script>
export default {
  name: "CharactersView",
  data() {
    return {
      selectedTeamFilter: "",
      imageErrors: {},
    };
  },
  computed: {
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
      return this.allCharacters.filter((c) => c.team_id === this.selectedTeamFilter);
    },
  },
  methods: {
    markImageError(characterId) {
      this.imageErrors = { ...this.imageErrors, [characterId]: true };
    },
    getTeamName(teamId) {
      const t = this.teams.find((item) => item.id === teamId);
      return t ? t.name : "팀 미정";
    },
    getTeamColor(teamId) {
      const t = this.teams.find((item) => item.id === teamId);
      return t ? t.color : "#8b7aa8";
    },
  },
};
</script>

<style scoped>
/* 캐릭터 목록, 검색 및 캐릭터 카드 화면에 적용됩니다. */
.characters-view { display: flex; flex-direction: column; gap: 24px; }
.actions { display: flex; gap: 12px; }
.filter-select { font-size: 13px; min-width: 180px; }

.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.character-card {
  display: flex; align-items: center; gap: 16px; text-decoration: none; color: var(--ink);
  transition: border-color 0.15s, transform 0.1s; padding: 18px;
}
.character-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.char-avatar {
  width: 56px; height: 56px; border-radius: 50%; background-size: cover; background-position: center;
  display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 20px;
  flex-shrink: 0; background-color: var(--line);
  overflow: hidden;
}
.char-avatar-image {
  width: 100%; height: 100%; object-fit: cover; border-radius: inherit;
}
.char-details { flex: 1; min-width: 0; }
.char-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.char-name-row h3 { margin: 0; font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.team-badge {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px;
  border: 1px solid var(--line); color: var(--muted); flex-shrink: 0;
}
.char-sub { font-size: 12px; margin: 0 0 2px; }
.char-meta { font-size: 12px; margin: 0; }
.card-arrow { color: var(--muted); font-size: 16px; }

.empty-state { text-align: center; padding: 48px; color: var(--muted); font-size: 14px; }
</style>
