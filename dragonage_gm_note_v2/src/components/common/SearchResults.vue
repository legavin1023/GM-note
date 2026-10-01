<template>
  <div class="search-results">
    <div class="search-head">
      <span class="eyebrow">SEARCH RESULTS</span>
      <button class="delete-button" @click="$emit('close')">×</button>
    </div>

    <div v-if="!hasResults" class="empty-search">
      "{{ query }}" 검색 결과가 없습니다.
    </div>

    <div v-else class="results-list">
      <!-- 캐릭터 결과 -->
      <div v-if="characterResults.length" class="result-section">
        <span class="section-tag">캐릭터 ({{ characterResults.length }})</span>
        <router-link
          v-for="c in characterResults"
          :key="'c-' + c.id"
          :to="'/characters/' + c.id"
          class="result-item"
          @click="$emit('close')"
        >
          <span class="res-title">{{ c.username }}</span>
          <span class="res-sub muted">PL: {{ c.player }} · {{ getTeamName(c.team_id) }}</span>
        </router-link>
      </div>

      <!-- 팀 결과 -->
      <div v-if="teamResults.length" class="result-section">
        <span class="section-tag">팀 ({{ teamResults.length }})</span>
        <router-link
          v-for="t in teamResults"
          :key="'t-' + t.id"
          :to="'/teams/' + t.id"
          class="result-item"
          @click="$emit('close')"
        >
          <span class="res-title">{{ t.name }}</span>
          <span class="res-sub muted">{{ t.region || '지역 미정' }}</span>
        </router-link>
      </div>

      <!-- 시나리오 결과 -->
      <div v-if="scenarioResults.length" class="result-section">
        <span class="section-tag">시나리오 ({{ scenarioResults.length }})</span>
        <router-link
          v-for="s in scenarioResults"
          :key="'s-' + s.id"
          :to="'/scenarios/' + s.id"
          class="result-item"
          @click="$emit('close')"
        >
          <span class="res-code">{{ s.code }}</span>
          <span class="res-title">{{ s.title }}</span>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "SearchResults",
  props: {
    query: { type: String, required: true },
  },
  computed: {
    teams() { return this.$store.getters.sortedTeams; },
    scenarios() { return this.$store.getters.sortedScenarios; },
    allCharacters() {
      return this.teams.flatMap((t) => (t.characters || []).map((c) => ({ ...c, team_id: t.id })));
    },
    q() { return this.query.trim().toLowerCase(); },

    characterResults() {
      if (!this.q) return [];
      return this.allCharacters.filter(
        (c) =>
          (c.username && c.username.toLowerCase().includes(this.q)) ||
          (c.player && c.player.toLowerCase().includes(this.q))
      );
    },
    teamResults() {
      if (!this.q) return [];
      return this.teams.filter((t) => t.name && t.name.toLowerCase().includes(this.q));
    },
    scenarioResults() {
      if (!this.q) return [];
      return this.scenarios.filter(
        (s) =>
          (s.title && s.title.toLowerCase().includes(this.q)) ||
          (s.code && s.code.toLowerCase().includes(this.q))
      );
    },
    hasResults() {
      return (
        this.characterResults.length > 0 ||
        this.teamResults.length > 0 ||
        this.scenarioResults.length > 0
      );
    },
  },
  methods: {
    getTeamName(teamId) {
      const t = this.teams.find((item) => item.id === teamId);
      return t ? t.name : "";
    },
  },
};
</script>

<style scoped>
/* 검색어 자동 완성 결과 목록과 결과 항목의 표시를 담당합니다. */
.search-results { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.search-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
.results-list { display: flex; flex-direction: column; gap: 14px; }
.result-section { display: flex; flex-direction: column; gap: 4px; }
.section-tag { font: 700 10px "DM Mono", monospace; color: var(--accent); text-transform: uppercase; margin-bottom: 2px; }
.result-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-radius: 4px; text-decoration: none; color: var(--ink);
  transition: background 0.1s;
}
.result-item:hover { background: var(--paper); }
.res-title { font-weight: 600; font-size: 13px; }
.res-sub { font-size: 11px; }
.res-code { font: 700 10px "DM Mono", monospace; background: var(--line); padding: 2px 6px; border-radius: 2px; margin-right: 8px; }

.empty-search { padding: 24px; text-align: center; color: var(--muted); font-size: 13px; }
</style>
