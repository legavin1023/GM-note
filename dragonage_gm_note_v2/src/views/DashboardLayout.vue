<template>
  <div class="app-shell" :class="{ 'dark-mode': darkMode }">
    <!-- 사이드바 -->
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">DA</span>
        <span>
          <b>DragonAge</b>
          <small>GM command center</small>
        </span>
      </div>

      <nav class="side-nav" aria-label="주요 메뉴">
        <router-link v-if="isGM" to="/master" class="nav-item">
          <span class="nav-icon">▦</span> 마스터 대시보드
        </router-link>
        <router-link to="/scenarios" class="nav-item">
          <span class="nav-icon">◈</span> 시나리오 트래커
        </router-link>
        <router-link
          v-if="!isGM && playerTeamId"
          :to="`/teams/${playerTeamId}`"
          class="nav-item"
        >
          <span class="nav-icon">♙</span> 내 팀 프로필
        </router-link>
        <router-link v-if="isGM" to="/teams" class="nav-item">
          <span class="nav-icon">♧</span> 팀 & 캐릭터
        </router-link>
        <router-link v-if="isGM" to="/characters" class="nav-item">
          <span class="nav-icon">☆</span> 캐릭터 목록
        </router-link>
        <router-link v-if="isGM" to="/gallery" class="nav-item">
          <span class="nav-icon">▧</span> 토큰 갤러리
        </router-link>
      </nav>

      <div class="sidebar-bottom">
        <button v-if="isGM" class="side-action" @click="handleExport">
          ↓ <span>전체 백업</span>
        </button>
        <button class="side-action" @click="toggleDark">
          {{ darkMode ? "☼" : "☾" }}
          <span>{{ darkMode ? "라이트 모드" : "다크 모드" }}</span>
        </button>
        <button class="side-action logout-action" @click="handleLogout">
          → <span>로그아웃</span>
        </button>
      </div>
    </aside>

    <!-- 컨텐츠 영역 -->
    <div class="content-shell">
      <header class="topbar">
        <div class="topbar-left">
          <span class="breadcrumb"
            >DRAGONAGE / {{ isGM ? "GM" : "PLAYER" }}</span
          >
          <h1 class="topbar-title">{{ pageTitle }}</h1>
        </div>
        <div class="topbar-right">
          <div v-if="searchQuery !== null" class="search-wrap">
            <input
              v-model="searchQuery"
              class="search-input"
              placeholder="캐릭터, 팀, 시나리오 검색..."
              @keyup.escape="searchQuery = null"
            />
          </div>
          <button
            v-if="isGM"
            class="icon-button"
            title="검색"
            @click="toggleSearch"
          >
            🔍
          </button>
          <span class="gm-badge">{{ isGM ? "GM" : "PLAYER" }}</span>
          <span v-if="gmEmail" class="gm-email">{{ gmEmail }}</span>
        </div>
      </header>

      <!-- 검색 결과 -->
      <div
        v-if="searchQuery !== null && searchQuery.length > 1"
        class="search-overlay"
      >
        <SearchResults :query="searchQuery" @close="searchQuery = null" />
      </div>

      <!-- 로딩 -->
      <div v-if="loading" class="global-loading">
        <span>데이터 불러오는 중...</span>
      </div>

      <!-- 메인 콘텐츠 -->
      <div v-else-if="loadError" class="no-campaign">
        <h2>서버 데이터를 불러오지 못했습니다</h2>
        <p>{{ loadError }}</p>
        <button class="primary-button" @click="retryLoad">다시 불러오기</button>
      </div>
      <main v-else class="main-content">
        <div v-if="loadErrors.length" class="load-warning" role="alert">
          <strong>일부 서버 데이터를 불러오지 못했습니다.</strong>
          <ul>
            <li v-for="(item, index) in loadErrors" :key="index">{{ item }}</li>
          </ul>
          <button class="text-button" @click="retryLoad">다시 불러오기</button>
        </div>
        <!-- 캠페인 없음 안내 -->
        <div v-if="!campaign && !loading" class="no-campaign">
          <h2>캠페인이 없습니다</h2>
          <p>
            Supabase의 <code>campaigns</code> 테이블에 현재 GM 계정 (<code>{{
              gmEmail
            }}</code
            >)의 <code>owner_id</code>로 등록된 캠페인이 없습니다.
          </p>
          <button class="primary-button" @click="createFirstCampaign">
            캠페인 생성
          </button>
        </div>
        <router-view v-else />
      </main>
    </div>

    <!-- 토스트 알림 -->
    <transition name="toast">
      <div
        v-if="toast"
        :key="toast.id"
        class="toast"
        :class="'toast--' + toast.type"
      >
        {{ toast.message }}
      </div>
    </transition>
  </div>
</template>

<script>
import { supabase } from "@/supabase";
import { signOut, onAuthStateChange } from "@/services/auth";
import { getCampaigns, createCampaign } from "@/services/campaigns";
import { getTeams, getProgressStages } from "@/services/teams";
import { getCharactersForTeams } from "@/services/characters";
import { getScenarios } from "@/services/scenarios";
import { exportFullBackup } from "@/services/scenarios";
import SearchResults from "@/components/common/SearchResults.vue";

const PAGE_TITLES = {
  master: "마스터 대시보드",
  teams: "팀 & 캐릭터",
  "team-detail": "팀 상세",
  characters: "캐릭터 목록",
  "character-detail": "캐릭터 상세",
  scenarios: "시나리오 트래커",
  "scenario-detail": "시나리오 상세",
  gallery: "토큰 갤러리",
};

export default {
  name: "DashboardLayout",
  components: { SearchResults },
  data() {
    return {
      darkMode: false,
      authSubscription: null,
      searchQuery: null,
      loadError: null,
      loadErrors: [],
      loadedUserId: null,
    };
  },
  computed: {
    gmEmail() {
      return this.$store.state.gmUser?.email || "";
    },
    campaign() {
      return this.$store.state.campaign;
    },
    loading() {
      return this.$store.state.loading;
    },
    toast() {
      return this.$store.state.toast;
    },
    pageTitle() {
      return PAGE_TITLES[this.$route.name] || "DragonAge GM";
    },
    isGM() {
      return this.$store.state.userRole !== "player";
    },
    playerTeamId() {
      return this.$store.state.playerTeamId;
    },
  },
  async mounted() {
    // 인증 상태 구독
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      this.$store.commit("setGmUser", session.user);
      await this.loadAll(session.user);
    }

    this.authSubscription = onAuthStateChange((session) => {
      if (session?.user) {
        this.$store.commit("setGmUser", session.user);
        if (this.loadedUserId !== session.user.id) {
          // Do not call Supabase APIs while the auth callback holds its internal lock.
          setTimeout(() => this.loadAll(session.user), 0);
        }
      } else {
        this.loadedUserId = null;
        this.$router.push({ name: "login" });
      }
    });
  },
  beforeUnmount() {
    this.authSubscription?.unsubscribe();
  },
  methods: {
    async loadAll(user) {
      this.$store.commit("setLoading", true);
      this.loadError = null;
      this.loadErrors = [];
      this.$store.commit("setCampaign", null);
      this.$store.commit("setTeams", []);
      this.$store.commit("setScenarios", []);
      this.$store.commit("setProgressStages", []);
      this.$store.commit("setPlayerContext", null);
      this.$store.commit("setPlayerStageRecords", []);
      try {
        const {
          data: { user: authenticatedUser },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authenticatedUser) throw new Error("GM 로그인이 필요합니다.");
        this.loadedUserId = authenticatedUser.id;
        this.$store.commit("setGmUser", authenticatedUser);
        const { data: playerContext, error: playerContextError } =
          await supabase.rpc("player_team_context");
        if (playerContextError) throw playerContextError;
        const playerMembership = Array.isArray(playerContext)
          ? playerContext[0]
          : null;
        if (playerMembership) {
          this.$store.commit("setPlayerContext", playerMembership.team_id);
          const { data: team, error: teamError } = await supabase
            .from("teams")
            .select(
              "id, name, description, region, color, sort_order, progress_step, total_steps, campaign_id"
            )
            .eq("id", playerMembership.team_id)
            .single();
          if (teamError) throw teamError;
          const { data: profiles, error: profileError } = await supabase.rpc(
            "player_team_profiles"
          );
          if (profileError) throw profileError;
          this.$store.commit("setCampaign", {
            id: playerMembership.campaign_id,
            name: "Player",
          });
          this.$store.commit("setTeams", [
            { ...team, characters: profiles || [] },
          ]);
          const progressStages = await getProgressStages();
          this.$store.commit("setProgressStages", progressStages);
          this.$store.commit("setScenarios", []);
          if (this.$route.name === "master")
            this.$router.replace({ name: "scenarios" });
          return;
        }
        this.$store.commit("setPlayerContext", null);
        console.info("[Supabase] GM auth OK", authenticatedUser.id);

        const campaigns = await getCampaigns(authenticatedUser.id);
        console.info(
          "[Supabase] campaigns rows:",
          campaigns.length,
          "ids:",
          campaigns.map((item) => item.id)
        );
        const campaign = campaigns[0] || null;
        this.$store.commit("setCampaign", campaign);

        if (campaign) {
          const { data: visibleTeamRows, error: visibleTeamsError } =
            await supabase.from("teams").select("id, campaign_id").limit(500);
          if (visibleTeamsError) {
            console.error(
              "[Supabase] TEAMS UNFILTERED ERROR",
              visibleTeamsError
            );
          } else {
            const byCampaign = (visibleTeamRows || []).reduce((counts, row) => {
              const key = row.campaign_id || "<null campaign_id>";
              counts[key] = (counts[key] || 0) + 1;
              return counts;
            }, {});
            console.info(
              "[Supabase] RLS-visible teams:",
              visibleTeamRows.length,
              "team counts by campaign_id:",
              byCampaign
            );
          }
          // Commit the primary roster before loading secondary resources so one
          // unrelated query failure cannot hide teams and characters.
          const teams = await getTeams(campaign.id);
          this.$store.commit("setTeams", teams);
          console.info("[Supabase] teams rows:", teams.length);
          try {
            const characters = await getCharactersForTeams(
              teams.map((team) => team.id)
            );
            const byTeam = new Map(teams.map((team) => [team.id, []]));
            characters.forEach((character) =>
              byTeam.get(character.team_id)?.push(character)
            );
            const teamsWithCharacters = teams.map((team) => ({
              ...team,
              characters: byTeam.get(team.id) || [],
            }));
            this.$store.commit("setTeams", teamsWithCharacters);
            console.info(
              "[Supabase] users/characters rows:",
              characters.length
            );
          } catch (error) {
            console.error("[Supabase] USERS/CHARACTERS ERROR", error);
            this.loadErrors.push(`캐릭터 조회 실패: ${error.message || error}`);
          }

          try {
            const scenarios = await getScenarios(campaign.id);
            this.$store.commit("setScenarios", scenarios);
            console.info(
              "[Supabase] scenarios/questions/choices:",
              scenarios.length,
              scenarios.reduce(
                (n, scenario) => n + (scenario.questions || []).length,
                0
              ),
              scenarios.reduce(
                (n, scenario) =>
                  n +
                  (scenario.questions || []).reduce(
                    (m, question) => m + (question.choices || []).length,
                    0
                  ),
                0
              )
            );
          } catch (error) {
            console.error("[Supabase] SCENARIOS ERROR", error);
            this.loadErrors.push(
              `시나리오 조회 실패: ${error.message || error}`
            );
          }
          try {
            const progressStages = await getProgressStages();
            this.$store.commit("setProgressStages", progressStages);
            console.info(
              "[Supabase] progress_stages rows:",
              progressStages.length
            );
          } catch (error) {
            console.error("[Supabase] PROGRESS_STAGES ERROR", error);
            this.loadErrors.push(
              `진행 단계 조회 실패: ${error.message || error}`
            );
          }
        } else {
          this.$store.commit("setTeams", []);
          this.$store.commit("setScenarios", []);
          this.$store.commit("setProgressStages", []);
        }
      } catch (error) {
        this.loadError = error.message || String(error);
        console.error("[Supabase] AUTH/CAMPAIGNS/TEAMS LOAD ERROR", error);
        this.$store.dispatch("showToast", {
          message: "데이터 로드 실패: " + (error.message || error),
          type: "error",
        });
      } finally {
        this.$store.commit("setLoading", false);
      }
    },

    async retryLoad() {
      if (this.$store.state.gmUser)
        await this.loadAll(this.$store.state.gmUser);
    },

    async createFirstCampaign() {
      try {
        const campaign = await createCampaign(
          this.$store.state.gmUser.id,
          "드래곤 에이지"
        );
        this.$store.commit("setCampaign", campaign);
        this.$store.dispatch("showToast", {
          message: "캠페인이 생성되었습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "캠페인 생성 실패: " + error.message,
          type: "error",
        });
      }
    },

    async handleLogout() {
      try {
        await signOut();
        this.$store.commit("setGmUser", null);
        this.$store.commit("setCampaign", null);
        this.$store.commit("setTeams", []);
        this.$store.commit("setScenarios", []);
        this.$store.commit("setPlayerContext", null);
        this.$store.commit("setPlayerStageRecords", []);
        this.$router.push({ name: "login" });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "로그아웃 실패: " + error.message,
          type: "error",
        });
      }
    },

    async handleExport() {
      const teams = this.$store.state.teams;
      const campaign = this.$store.state.campaign;
      if (!campaign) return;

      try {
        const backup = await exportFullBackup(campaign.id, teams);
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `dragonage-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.$store.dispatch("showToast", {
          message: "백업 파일을 내보냈습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "백업 실패: " + error.message,
          type: "error",
        });
      }
    },

    toggleDark() {
      this.darkMode = !this.darkMode;
      document.body.classList.toggle("dark-mode", this.darkMode);
    },

    toggleSearch() {
      this.searchQuery = this.searchQuery === null ? "" : null;
    },
  },
};
</script>

<style>
/* 로그인 화면을 제외한 앱 전체의 기본 레이아웃과 공통 UI에 적용됩니다. */
/* 전역 CSS 변수 */
@import url("https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap");
:root {
  --ink: #20232d;
  --muted: #7d8495;
  --line: #e8e9ee;
  --paper: #f5f5f3;
  --panel: #fff;
  --accent: #c97954;
  --accent-hover: #b86a44;
  --navy: #293044;
  --success: #4a9f6e;
  --error: #e06060;
  --warning: #e0a050;
}
.dark-mode {
  --ink: #e8e6e0;
  --muted: #8c929e;
  --line: #2e3448;
  --paper: #181c28;
  --panel: #20253a;
  --navy: #d4cfc8;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "Manrope", sans-serif;
  font-size: 14px;
  line-height: 1.6;
}
button,
input,
textarea,
select {
  font: inherit;
}
button {
  cursor: pointer;
}
a {
  color: inherit;
  text-decoration: none;
}

/* 공통 버튼 */
.primary-button {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 10px 18px;
  font-weight: 700;
  border-radius: 2px;
  transition: background 0.15s;
}
.primary-button:hover:not(:disabled) {
  background: var(--accent-hover);
}
.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.outline-button {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
  padding: 9px 16px;
  font-weight: 600;
  border-radius: 2px;
  transition: all 0.15s;
}
.outline-button:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
}

.secondary-button {
  background: var(--line);
  color: var(--ink);
  border: none;
  padding: 9px 16px;
  font-weight: 600;
  border-radius: 2px;
}

.danger-button {
  background: var(--error);
  color: #fff;
  border: none;
  padding: 9px 16px;
  font-weight: 600;
  border-radius: 2px;
}
.danger-button:hover:not(:disabled) {
  background: #c04040;
}

.text-button {
  background: none;
  border: none;
  color: var(--accent);
  padding: 0;
  font-weight: 600;
  font-size: 13px;
}

.icon-button {
  background: none;
  border: none;
  padding: 6px;
  font-size: 18px;
  line-height: 1;
  color: var(--muted);
  border-radius: 4px;
  transition: background 0.1s;
}
.icon-button:hover {
  background: var(--line);
}

.delete-button {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 16px;
  padding: 4px 8px;
  border-radius: 2px;
  transition: color 0.1s, background 0.1s;
}
.delete-button:hover {
  color: var(--error);
  background: rgba(224, 96, 96, 0.1);
}

/* 공통 텍스트 */
.eyebrow {
  color: var(--muted);
  display: block;
  font: 500 10px "DM Mono", monospace;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.section-title {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
}
.muted {
  color: var(--muted);
}

/* 공통 폼 */
.form-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.form-input {
  background: var(--paper);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 10px 12px;
  border-radius: 2px;
  outline: none;
  width: 100%;
  transition: border-color 0.15s;
}
.form-input:focus {
  border-color: var(--accent);
}
.form-textarea {
  background: var(--paper);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 10px 12px;
  border-radius: 2px;
  outline: none;
  width: 100%;
  min-height: 80px;
  resize: vertical;
  transition: border-color 0.15s;
}
.form-textarea:focus {
  border-color: var(--accent);
}

/* 진행바 */
.progress-bar {
  background: var(--line);
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

/* 배지 */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.badge-success {
  background: rgba(74, 159, 110, 0.15);
  color: var(--success);
}
.badge-muted {
  background: var(--line);
  color: var(--muted);
}
.badge-accent {
  background: rgba(201, 121, 84, 0.15);
  color: var(--accent);
}

/* 카드 */
.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 20px;
}

/* 섹션 헤더 */
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
</style>

<style scoped>
/* 대시보드 셸의 사이드바, 상단 바, 반응형 내비게이션에 적용됩니다. */
.app-shell {
  display: flex;
  min-height: 100vh;
}

/* 사이드바 */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #202531;
  color: #f4f2ed;
  padding: 24px 14px 20px;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 28px;
  letter-spacing: -0.02em;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  background: #c97954;
  color: #fff;
  font: 600 11px "DM Mono", monospace;
  border-radius: 2px;
  flex-shrink: 0;
}
.brand b {
  display: block;
  font-size: 14px;
}
.brand small {
  display: block;
  color: #969baa;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-top: 2px;
}
.side-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  color: #9fa5b0;
  border-radius: 4px;
  font-size: 13px;
  transition: background 0.1s, color 0.1s;
  text-decoration: none;
}
.nav-item:hover {
  color: #fff;
  background: #2d3245;
}
.nav-item.router-link-active {
  color: #fff;
  background: #313746;
}
.nav-item.router-link-active .nav-icon {
  color: #d78a65;
}
.nav-icon {
  width: 16px;
  text-align: center;
  font-size: 14px;
}
.nav-divider {
  height: 1px;
  background: #2e3448;
  margin: 8px 0;
}
.nav-admin {
  font-size: 12px;
}
.sidebar-bottom {
  margin-top: auto;
  padding-top: 12px;
}
.side-action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: none;
  border: none;
  color: #9fa5b0;
  padding: 8px 10px;
  font-size: 12px;
  border-radius: 4px;
  text-align: left;
  transition: color 0.1s, background 0.1s;
}
.side-action:hover {
  color: #fff;
  background: #2d3245;
}
.logout-action:hover {
  color: #e06060;
}

/* 컨텐츠 */
.content-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  gap: 16px;
  position: sticky;
  top: 0;
  z-index: 10;
}
.topbar-left .breadcrumb {
  font: 500 10px "DM Mono", monospace;
  letter-spacing: 0.12em;
  color: var(--muted);
  text-transform: uppercase;
  display: block;
}
.topbar-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 2px 0 0;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.gm-badge {
  background: #c97954;
  color: #fff;
  font: 700 10px "DM Mono", monospace;
  padding: 3px 7px;
  border-radius: 2px;
}
.gm-email {
  font-size: 12px;
  color: var(--muted);
}
.search-wrap {
  position: relative;
}
.search-input {
  background: var(--paper);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 8px 14px;
  border-radius: 2px;
  width: 240px;
  outline: none;
  font-size: 13px;
}
.search-input:focus {
  border-color: var(--accent);
}

.main-content {
  flex: 1;
  padding: 28px;
  background: var(--paper);
}

.global-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 14px;
}
.load-warning {
  margin-bottom: 20px;
  padding: 14px 18px;
  border: 1px solid var(--warning);
  border-radius: 4px;
  background: rgba(224, 160, 80, 0.08);
}
.load-warning ul {
  margin: 8px 0;
  padding-left: 20px;
}

.no-campaign {
  max-width: 480px;
  margin: 60px auto;
  text-align: center;
}
.no-campaign h2 {
  margin-bottom: 12px;
}
.no-campaign p {
  color: var(--muted);
  margin-bottom: 24px;
  line-height: 1.8;
}
.no-campaign code {
  background: var(--line);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.search-overlay {
  position: fixed;
  top: 70px;
  right: 28px;
  z-index: 100;
  width: 360px;
  max-height: 480px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  overflow-y: auto;
}

/* 토스트 */
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 14px 20px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  z-index: 1000;
  max-width: 360px;
}
.toast--success {
  background: #1a3a28;
  color: #6fcf97;
  border: 1px solid #4a9f6e;
}
.toast--error {
  background: #3a1a1a;
  color: #f06060;
  border: 1px solid #e06060;
}
.toast--warning {
  background: #3a2a1a;
  color: #f0a050;
  border: 1px solid #e0a050;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s;
}

/* 반응형 */
@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    height: auto;
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .brand {
    padding-bottom: 0;
  }
  .side-nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .sidebar-bottom {
    display: none;
  }
  .main-content {
    padding: 16px;
  }
  .topbar {
    padding: 12px 16px;
  }
  .gm-email {
    display: none;
  }
  .search-overlay {
    right: 0;
    width: calc(100vw - 32px);
  }
}
</style>
