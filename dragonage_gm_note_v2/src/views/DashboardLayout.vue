<template>
  <div
    class="app-shell"
    :class="{ 'dark-mode': darkMode, 'gm-player-preview': isPlayerPreview }"
  >
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">DA</span>
        <span><b>DragonAge</b><small>GM command center</small></span>
      </div>

      <nav class="side-nav" aria-label="주요 메뉴">
        <router-link to="/home" class="nav-item nav-home">
          <span class="nav-icon">⌂</span> 메인
        </router-link>
        <router-link
          v-if="isGM"
          to="/master"
          class="nav-item nav-master-dashboard"
          :class="{ 'preview-disabled': isPlayerPreview }"
          :aria-disabled="isPlayerPreview"
          @click="isPlayerPreview && $event.preventDefault()"
        >
          <span class="nav-icon">▦</span> 대시보드
        </router-link>
        <router-link to="/scenarios" class="nav-item nav-scenarios">
          <span class="nav-icon">◈</span> 시나리오
        </router-link>
        <router-link
          v-if="(!isGM && playerTeamId) || (isPlayerPreview && playerTeamId)"
          :to="`/teams/${playerTeamId}`"
          class="nav-item nav-my-team"
        >
          <span class="nav-icon">♙</span> 내 팀
        </router-link>
        <router-link
          v-if="isGM"
          to="/teams"
          class="nav-item nav-team-management"
          :class="{ 'preview-disabled': isPlayerPreview }"
          :aria-disabled="isPlayerPreview"
          @click="isPlayerPreview && $event.preventDefault()"
        >
          <span class="nav-icon">♧</span> 팀
        </router-link>
        <router-link to="/characters" class="nav-item nav-characters">
          <span class="nav-icon">☆</span> 캐릭터
        </router-link>
        <router-link to="/gallery" class="nav-item nav-gallery">
          <span class="nav-icon">▧</span> 토큰
        </router-link>
        <router-link to="/board/free" class="nav-item nav-team-art">
          <span class="nav-icon">▤</span> 게시판
        </router-link>
        <router-link to="/notices" class="nav-item nav-notices">
          <span class="nav-icon">▣</span> 전체공지
        </router-link>
      </nav>
    </aside>

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
            :disabled="isPlayerPreview"
            :class="{ 'preview-disabled': isPlayerPreview }"
            @click="toggleSearch"
          >
            🔍
          </button>
          <span class="gm-badge">{{ isGM ? "GM" : "PLAYER" }}</span>
          <button
            v-if="isMaster"
            type="button"
            class="preview-mode-toggle"
            :aria-pressed="isPlayerPreview"
            @click="togglePlayerPreview"
          >
            {{ isPlayerPreview ? "마스터 화면" : "플레이어 화면" }}
          </button>
          <label v-if="isPlayerPreview" class="preview-team-select">
            <!-- <span class="sr-only">플레이어 화면으로 볼 팀</span> -->
            <select
              class="form-input"
              :value="playerTeamId || ''"
              aria-label="플레이어 화면으로 볼 팀 선택"
              @change="selectPreviewTeam($event.target.value)"
            >
              <option value="" disabled>팀 선택</option>
              <option
                v-for="team in sortedTeams"
                :key="team.id"
                :value="team.id"
              >
                {{ team.name }} 플레이어 화면
              </option>
            </select>
          </label>
          <div class="activity-notifications">
            <button
              type="button"
              class="notification-trigger"
              :aria-expanded="notificationsOpen"
              aria-haspopup="true"
              aria-label="내 태그와 글 반응 알림"
              @click="toggleNotifications"
            >
              <span aria-hidden="true">♧</span>
              <span>알림</span>
              <span
                v-if="activityNotifications.length"
                class="notification-count"
              >
                {{
                  activityNotifications.length > 9
                    ? "9+"
                    : activityNotifications.length
                }}
              </span>
            </button>
            <section
              v-if="notificationsOpen"
              class="notification-popover"
              aria-label="내 활동 알림"
            >
              <header class="notification-header">
                <strong>내 활동</strong>
                <button
                  type="button"
                  class="text-button"
                  @click="notificationsOpen = false"
                >
                  닫기
                </button>
              </header>
              <p v-if="notificationsLoading" class="notification-empty">
                알림을 불러오는 중…
              </p>
              <p
                v-else-if="notificationsError"
                class="notification-empty notification-error"
              >
                {{ notificationsError }}
              </p>
              <p
                v-else-if="!activityNotifications.length"
                class="notification-empty"
              >
                새 태그나 댓글이 없습니다.
              </p>
              <button
                v-for="item in activityNotifications"
                :key="item.id"
                type="button"
                class="notification-item"
                @click="openActivityNotification(item)"
              >
                <strong>{{
                  item.kind === "tag" ? "나를 태그한 작품" : "내 작품의 새 댓글"
                }}</strong>
                <span
                  >{{ item.actor }} ·
                  {{ formatNotificationDate(item.createdAt) }}</span
                >
                <p>{{ item.preview }}</p>
              </button>
            </section>
          </div>
          <span v-if="accountName" class="gm-email">{{ accountName }}</span>
          <div class="topbar-fixed-actions" aria-label="화면 설정 및 백업">
            <button
              v-if="isGM"
              class="topbar-action"
              type="button"
              title="전체 백업"
              :disabled="isPlayerPreview"
              :class="{ 'preview-disabled': isPlayerPreview }"
              @click="handleExport"
            >
              ↓ <span>백업</span>
            </button>
            <button
              class="topbar-action"
              type="button"
              :title="darkMode ? '라이트 모드' : '다크 모드'"
              @click="toggleDark"
            >
              {{ darkMode ? "☼" : "☾" }}
              <span>{{ darkMode ? "라이트" : "다크" }}</span>
            </button>
          </div>
          <button class="topbar-logout" type="button" @click="handleLogout">
            로그아웃
          </button>
        </div>
      </header>

      <div v-if="isPlayerPreview" class="preview-banner" role="status">
        <strong>플레이어 화면 미리보기</strong>
        <span>
          {{
            sortedTeams.find((team) => team.id === playerTeamId)?.name ||
            "팀 미선택"
          }}
          기준으로 확인 중 · 마스터 전용 기능은 비활성화되어 있습니다.
        </span>
      </div>

      <aside
        v-if="incompleteTrackerNotice && isGM && !isPlayerPreview"
        class="tracker-reminder-ad"
        role="status"
        aria-label="미완료 시나리오 기록 알림"
      >
        <div class="tracker-reminder-copy">
          <span class="tracker-reminder-label">기록 확인 알림</span>
          <strong>
            완료 체크가 필요한 시나리오가
            {{ incompleteTrackerNotice.length }}개 있어요.
          </strong>
          <span class="tracker-reminder-subtitle">
            진행 현황을 확인하고 기록을 보완해주세요.
          </span>
          <div class="tracker-reminder-links">
            <router-link
              v-for="item in incompleteTrackerNotice.slice(0, 3)"
              :key="`${item.teamId}-${item.stepNumber}`"
              :to="{
                path: `/scenarios/${item.stepNumber}`,
                query: { teamId: item.teamId },
              }"
              class="tracker-reminder-link"
            >
              {{ item.teamName }} · {{ item.title }} 확인
            </router-link>
            <span v-if="incompleteTrackerNotice.length > 3" class="muted">
              외 {{ incompleteTrackerNotice.length - 3 }}개
            </span>
          </div>
        </div>
        <button
          type="button"
          class="tracker-reminder-dismiss"
          aria-label="알림 닫기"
          @click="incompleteTrackerNotice = null"
        >
          ×
        </button>
      </aside>

      <div
        v-if="searchQuery !== null && searchQuery.length > 1"
        class="search-overlay"
      >
        <SearchResults :query="searchQuery" @close="searchQuery = null" />
      </div>

      <div v-if="loading" class="global-loading">
        <span>데이터 불러오는 중...</span>
      </div>
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
        <div v-if="!campaign && !loading" class="no-campaign">
          <h2>캠페인이 없습니다</h2>
          <p>
            Supabase의 <code>campaigns</code> 테이블에 현재 계정 (<code>{{
              accountName
            }}</code
            >)이 접근할 수 있는 캠페인이 없습니다.
          </p>
          <button
            v-if="isGM"
            class="primary-button"
            @click="createFirstCampaign"
          >
            캠페인 생성
          </button>
        </div>
        <router-view v-else />
      </main>
    </div>

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
import { getScenarios, exportFullBackup } from "@/services/scenarios";
import SearchResults from "@/components/common/SearchResults.vue";

const PAGE_TITLES = {
  home: "메인",
  master: "마스터 대시보드",
  teams: "팀 & 캐릭터",
  "team-detail": "팀 상세",
  characters: "캐릭터 목록",
  "character-detail": "캐릭터 상세",
  scenarios: "시나리오 트래커",
  "scenario-npcs": "주요 NPC",
  "npc-feedback": "NPC 평점과 댓글",
  "scenario-detail": "시나리오 상세",
  gallery: "토큰 갤러리",
  "free-board": "팀 작품 게시판",
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
      gmUsername: "",
      activityNotifications: [],
      notificationsLoading: false,
      notificationsOpen: false,
      notificationsError: "",
      incompleteTrackerNotice: null,
    };
  },
  computed: {
    accountName() {
      if (this.$store.state.userRole === "player" || this.isPlayerPreview) {
        const playerUserId =
          this.$store.state.playerCharacterId ||
          this.$store.state.gmUser?.user_metadata?.player_user_id;
        const team = this.$store.getters.teamById(this.playerTeamId);
        const profiles = team?.characters || [];
        const profile =
          profiles.find((item) => item.id === playerUserId) ||
          profiles.find((item) => item.player) ||
          profiles[0];
        return (
          profile?.player?.trim() ||
          profile?.character_name?.trim() ||
          "플레이어"
        );
      }
      return (
        this.gmUsername ||
        this.$store.state.gmUser?.user_metadata?.username ||
        "마스터"
      );
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
      if (String(this.$route.name || "").startsWith("notice"))
        return "전체공지";
      return PAGE_TITLES[this.$route.name] || "DragonAge GM";
    },
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
    sortedTeams() {
      return this.$store.getters.sortedTeams;
    },
  },
  async mounted() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      this.$store.commit("setGmUser", session.user);
      await this.loadAll();
    }
    this.authSubscription = onAuthStateChange((session) => {
      if (session?.user) {
        this.$store.commit("setGmUser", session.user);
        if (this.loadedUserId !== session.user.id) {
          setTimeout(() => this.loadAll(), 0);
        }
      } else {
        this.loadedUserId = null;
        this.$store.commit("setGmUser", null);
        this.$store.commit("setPlayerContext", null);
        this.activityNotifications = [];
        this.notificationsOpen = false;
        this.$router.push({ name: "login" });
      }
    });
  },
  beforeUnmount() {
    this.authSubscription?.unsubscribe();
  },
  methods: {
    async loadActivityNotifications(user, characterId) {
      if (!user?.id) return;
      this.notificationsLoading = true;
      this.notificationsError = "";
      try {
        const [taggedResult, ownPostsResult] = await Promise.all([
          supabase
            .from("team_art_posts")
            .select("id, team_id, user_id, nickname, content, created_at")
            .contains("character_tags", [characterId || user.id])
            .neq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("team_art_posts")
            .select("id, team_id")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);
        if (taggedResult.error) throw taggedResult.error;
        if (ownPostsResult.error) throw ownPostsResult.error;

        const ownPosts = ownPostsResult.data || [];
        let commentNotifications = [];
        if (ownPosts.length) {
          const postIds = ownPosts.map((post) => post.id);
          const { data: comments, error } = await supabase
            .from("team_art_comments")
            .select("id, post_id, user_id, nickname, content, created_at")
            .in("post_id", postIds)
            .neq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20);
          if (error) throw error;
          const postsById = Object.fromEntries(
            ownPosts.map((post) => [post.id, post])
          );
          commentNotifications = (comments || []).map((comment) => ({
            id: `comment-${comment.id}`,
            kind: "comment",
            actor: comment.nickname || "사용자",
            preview: comment.content || "이미지 댓글을 남겼습니다.",
            createdAt: comment.created_at,
            postId: comment.post_id,
            teamId: postsById[comment.post_id]?.team_id || "",
          }));
        }
        const tagNotifications = (taggedResult.data || []).map((post) => ({
          id: `tag-${post.id}`,
          kind: "tag",
          actor: post.nickname || "사용자",
          preview: post.content || "작품에서 내 캐릭터를 태그했습니다.",
          createdAt: post.created_at,
          postId: post.id,
          teamId: post.team_id,
        }));
        this.activityNotifications = [
          ...tagNotifications,
          ...commentNotifications,
        ]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 10);
      } catch (error) {
        this.activityNotifications = [];
        this.notificationsError =
          "알림을 불러오지 못했습니다. 팀 작품 게시판 DB 설정을 확인해 주세요.";
        console.warn("Activity notifications could not be loaded", error);
      } finally {
        this.notificationsLoading = false;
      }
    },
    toggleNotifications() {
      this.notificationsOpen = !this.notificationsOpen;
      if (this.notificationsOpen) {
        const user = this.$store.state.gmUser;
        this.loadActivityNotifications(
          user,
          this.$store.state.playerCharacterId || user?.id
        );
      }
    },
    openActivityNotification(item) {
      this.notificationsOpen = false;
      this.$router.push({
        name: "free-board",
        query: { teamId: item.teamId || undefined, postId: item.postId },
      });
    },
    formatNotificationDate(value) {
      return new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    },
    async loadAll() {
      this.$store.commit("setLoading", true);
      this.loadError = null;
      this.loadErrors = [];
      this.incompleteTrackerNotice = null;
      this.$store.commit("setPlayerContext", null);
      this.$store.commit("setPlayerStageRecords", []);
      try {
        const {
          data: { user: authenticatedUser },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authenticatedUser) throw new Error("로그인이 필요합니다.");
        this.loadedUserId = authenticatedUser.id;
        this.$store.commit("setGmUser", authenticatedUser);

        const { data: hasGmAccess, error: gmAccessError } = await supabase.rpc(
          "current_user_is_gm"
        );
        if (gmAccessError) throw gmAccessError;
        this.$store.commit("setUserRole", hasGmAccess ? "gm" : "player");
        if (hasGmAccess) {
          const { data: gmProfile, error: gmProfileError } = await supabase
            .from("users")
            .select("username")
            .eq("id", authenticatedUser.id)
            .maybeSingle();
          if (gmProfileError) {
            console.warn("Master username could not be loaded", gmProfileError);
          }
          this.gmUsername =
            gmProfile?.username?.trim() ||
            authenticatedUser.user_metadata?.username ||
            "마스터";
        } else {
          this.gmUsername = "";
        }
        const { data: playerContext, error: playerContextError } = hasGmAccess
          ? { data: [], error: null }
          : await supabase.rpc("player_character_context");
        if (playerContextError) throw playerContextError;
        const playerMembership = Array.isArray(playerContext)
          ? playerContext[0]
          : null;

        if (playerMembership) {
          this.$store.commit("setPlayerContext", {
            teamId: playerMembership.team_id,
            characterId: playerMembership.character_id,
          });
          const { error: teamError } = await supabase
            .from("teams")
            .select("id")
            .eq("id", playerMembership.team_id)
            .single();
          if (teamError) throw teamError;
          const { data: profiles, error: profileError } = await supabase.rpc(
            "player_team_profiles"
          );
          if (profileError) throw profileError;
          const publicProfiles = (profiles || []).map((profile) => ({
            ...profile,
          }));
          const { data: campaignTeams, error: campaignTeamsError } =
            await supabase
              .from("teams")
              .select(
                "id, name, description, region, color, sort_order, progress_step, total_steps, campaign_id"
              )
              .eq("campaign_id", playerMembership.campaign_id)
              .order("sort_order", { ascending: true });
          if (campaignTeamsError) throw campaignTeamsError;
          this.$store.commit("setCampaign", {
            id: playerMembership.campaign_id,
            name: "Player",
          });
          this.$store.commit(
            "setTeams",
            (campaignTeams || []).map((team) => ({
              ...team,
              characters: publicProfiles.filter(
                (profile) => profile.team_id === team.id
              ),
            }))
          );
          const progressStages = await getProgressStages();
          this.$store.commit("setProgressStages", progressStages);
          const scenarios = await getScenarios(playerMembership.campaign_id);
          this.$store.commit("setScenarios", scenarios);
          this.loadActivityNotifications(
            authenticatedUser,
            playerMembership.character_id
          );
          if (this.$route.name === "master")
            this.$router.replace({ name: "scenarios" });
          return;
        }

        this.$store.commit("setPlayerContext", null);
        const campaigns = await getCampaigns();
        const campaign = campaigns[0] || null;
        this.$store.commit("setCampaign", campaign);
        if (campaign) {
          const teams = await getTeams(campaign.id);
          this.$store.commit("setTeams", teams);
          try {
            const characters = await getCharactersForTeams(
              teams.map((team) => team.id)
            );
            this.$store.commit(
              "setTeams",
              teams.map((team) => ({
                ...team,
                characters: characters.filter(
                  (character) => character.team_id === team.id
                ),
              }))
            );
          } catch (error) {
            console.error("[Supabase] USERS/CHARACTERS ERROR", error);
            this.loadErrors.push(`캐릭터 조회 실패: ${error.message || error}`);
          }
          try {
            this.$store.commit("setScenarios", await getScenarios(campaign.id));
          } catch (error) {
            console.error("[Supabase] SCENARIOS ERROR", error);
            this.loadErrors.push(
              `시나리오 조회 실패: ${error.message || error}`
            );
          }
          try {
            const progressStages = await getProgressStages();
            this.$store.commit("setProgressStages", progressStages);
            await this.loadIncompleteTrackerNotice(teams, progressStages);
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
        this.loadActivityNotifications(
          authenticatedUser,
          hasGmAccess ? authenticatedUser.id : null
        );
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
      if (this.$store.state.gmUser) await this.loadAll();
    },
    async loadIncompleteTrackerNotice(teams, stages) {
      this.incompleteTrackerNotice = null;
      if (!this.isGM || !teams?.length || !stages?.length) return;

      try {
        const { data, error } = await supabase
          .from("team_scenarios")
          .select("team_id, step_number, completed")
          .in(
            "team_id",
            teams.map((team) => team.id)
          )
          .not("step_number", "is", null);
        if (error) throw error;

        const records = new Map(
          (data || []).map((record) => [
            `${record.team_id}:${record.step_number}`,
            record,
          ])
        );
        const incomplete = [];
        for (const team of teams) {
          const progressStep = Number(team.progress_step) || 1;
          for (const stage of stages) {
            const stepNumber = Number(stage.step_number);
            if (
              stage.is_active === false ||
              !Number.isInteger(stepNumber) ||
              stepNumber >= progressStep
            ) {
              continue;
            }
            const record = records.get(`${team.id}:${stepNumber}`);
            if (!record?.completed) {
              incomplete.push({
                teamId: team.id,
                teamName: team.name,
                stepNumber,
                title: stage.title || `시나리오 ${stepNumber}`,
              });
            }
          }
        }
        this.incompleteTrackerNotice = incomplete.length ? incomplete : null;
      } catch (error) {
        // The reminder is supplemental; do not block the dashboard if tracker
        // status cannot be read.
        console.warn("Incomplete tracker reminder could not be loaded", error);
      }
    },
    togglePlayerPreview() {
      if (!this.isMaster) return;
      if (this.isPlayerPreview) {
        this.$store.commit("setGmPlayerPreview", false);
        return;
      }
      const routeTeamId = String(this.$route.params.teamId || "");
      const firstTeamId = this.sortedTeams[0]?.id || null;
      const selectedTeamId = this.sortedTeams.some(
        (team) => team.id === routeTeamId
      )
        ? routeTeamId
        : this.$store.state.playerTeamId || firstTeamId;
      this.$store.commit("setGmPreviewTeam", selectedTeamId);
      this.$store.commit("setGmPlayerPreview", true);
      const playerPageRedirect = {
        master: "/home",
        teams: "/home",
        "character-detail": "/characters",
        "notice-create": "/notices",
        "notice-edit": "/notices",
      }[this.$route.name];
      if (playerPageRedirect) this.$router.push(playerPageRedirect);
    },
    selectPreviewTeam(teamId) {
      if (!this.isMaster) return;
      this.$store.commit("setGmPreviewTeam", teamId);
      if (this.$route.name === "team-detail" && teamId) {
        this.$router.replace(`/teams/${teamId}`);
      }
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
    toggleSearch() {
      this.searchQuery = this.searchQuery === null ? "" : null;
    },
    toggleDark() {
      this.darkMode = !this.darkMode;
    },
    async handleLogout() {
      try {
        await signOut();
        this.$router.push({ name: "login" });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "로그아웃 실패: " + error.message,
          type: "error",
        });
      }
    },
    async handleExport() {
      try {
        const data = await exportFullBackup();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
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
  },
};
</script>

<style>
@import url("https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap");
:root {
  --ink: #202020;
  --muted: #696969;
  --line: #dedede;
  --paper: #f3f3f1;
  --panel: #fff;
  --accent: #a94b55;
  --accent-hover: #8f3d47;
  --accent-foreground: #fff;
  --accent-soft: rgba(169, 75, 85, 0.12);
  --navy: #171717;
  --nav-text: #f5f5f5;
  --nav-muted: #b8b8b8;
  --nav-hover: #292929;
  --nav-active: #373737;
  --nav-divider: #3b3b3b;
  --nav-accent: #d8878e;
  --success: #4a9f6e;
  --error: #c62828;
  --warning: #a85b00;
}
.dark-mode {
  --ink: #ededed;
  --muted: #b0b0b0;
  --line: #383838;
  --paper: #111;
  --panel: #1d1d1d;
  --accent: #d47b83;
  --accent-hover: #bf6972;
  --accent-foreground: #171717;
  --accent-soft: rgba(212, 123, 131, 0.16);
  --error: #ff6b6b;
  --warning: #f0ae58;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "Manrope", sans-serif;
}
a {
  color: inherit;
}
.primary-button {
  background: var(--accent);
  color: var(--accent-foreground);
  border: none;
  padding: 10px 18px;
  font-weight: 700;
  cursor: pointer;
}
.primary-button:hover {
  background: var(--accent-hover);
}
.outline-button {
  border: 1px solid var(--accent);
  color: var(--accent);
  background: transparent;
  padding: 9px 16px;
  cursor: pointer;
}
.outline-button:hover:not(:disabled) {
  background: var(--accent);
  color: var(--accent-foreground);
}
.secondary-button {
  border: 1px solid var(--line);
  color: var(--ink);
  background: var(--panel);
  padding: 9px 16px;
  cursor: pointer;
}
.text-button {
  border: 0;
  background: none;
  color: var(--accent);
  cursor: pointer;
}
.eyebrow {
  color: var(--muted);
  display: block;
  font: 500 10px "DM Mono", monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 20px;
}
.form-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
}
.form-input,
.form-select,
.form-textarea {
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  color: var(--ink);
  padding: 9px 11px;
  font: inherit;
}
.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}
.progress-bar {
  background: var(--line);
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
}
.progress-bar-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s ease;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--line);
  color: var(--muted);
  font-size: 11px;
}
.badge-accent {
  background: var(--accent-soft);
  color: var(--accent);
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.preview-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 0 28px;
  padding: 9px 12px;
  border: 1px solid #d8d4d0;
  border-radius: 6px;
  background: #f1efed;
  color: #77716d;
  font-size: 12px;
}
.preview-banner strong {
  color: #5e5955;
}
.preview-disabled,
.gm-player-preview .preview-disabled,
.gm-player-preview .master-only {
  opacity: 0.48 !important;
  filter: grayscale(1);
  cursor: not-allowed !important;
}
.preview-disabled-panel {
  opacity: 0.58;
  filter: grayscale(0.75);
}
.gm-player-preview .preview-banner ~ .main-content .master-only {
  pointer-events: none;
}
@media (max-width: 768px) {
  html,
  body {
    max-width: 100%;
    overflow-x: hidden;
  }
  button,
  [role="button"],
  input[type="checkbox"],
  input[type="radio"] {
    touch-action: manipulation;
  }
  button,
  .primary-button,
  .outline-button,
  .secondary-button {
    min-height: 40px;
  }
  input:not([type="checkbox"]):not([type="radio"]),
  select,
  textarea {
    max-width: 100%;
    font-size: 16px;
  }
  img,
  video,
  iframe {
    max-width: 100%;
  }
  table {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  position: sticky;
  top: 0;
  align-self: flex-start;
  width: 220px;
  height: 100vh;
  flex-shrink: 0;
  background: var(--navy);
  color: var(--nav-text);
  padding: 24px 14px 20px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 0 8px 26px;
  color: var(--nav-text);
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  background: var(--accent);
  color: var(--accent-foreground);
  font: 600 11px "DM Mono", monospace;
  border-radius: 2px;
  flex-shrink: 0;
}
.brand b {
  font-size: 14px;
  letter-spacing: -0.02em;
}
.brand small {
  display: block;
  color: var(--nav-muted);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.side-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.side-nav .nav-home {
  order: 1;
}
.side-nav .nav-my-team {
  order: 2;
}
.side-nav .nav-scenarios {
  order: 3;
}
.side-nav .nav-team-art {
  order: 4;
}
.side-nav .nav-notices {
  order: 5;
}
.side-nav .nav-characters {
  order: 6;
}
.side-nav .nav-gallery {
  order: 7;
}
.side-nav .nav-master-dashboard {
  order: 8;
}
.side-nav .nav-team-management {
  order: 9;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  color: var(--nav-muted);
  border-radius: 4px;
  font-size: 13px;
  transition: background 0.1s, color 0.1s;
  text-decoration: none;
}
.nav-item:hover {
  color: var(--nav-text);
  background: var(--nav-hover);
}
.nav-item.router-link-active {
  color: var(--nav-text);
  background: var(--nav-active);
}
.nav-item.router-link-active .nav-icon {
  color: var(--nav-accent);
}
.nav-icon {
  width: 16px;
  text-align: center;
  font-size: 15px;
}
.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: auto;
  padding-top: 20px;
}
.side-action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: none;
  border: none;
  color: var(--nav-muted);
  padding: 8px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: color 0.1s, background 0.1s;
}
.side-action:hover {
  color: var(--nav-text);
  background: var(--nav-hover);
}
.logout-action:hover {
  color: var(--error);
}
.content-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 28px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
}
.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.topbar-left {
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}
.breadcrumb {
  color: var(--muted);
  font: 500 9px "DM Mono", monospace;
  letter-spacing: 0.12em;
}
.topbar-title {
  margin: 0;
  color: var(--ink);
  font-size: 20px;
  font-weight: 700;
}
.search-wrap {
  position: relative;
}
.search-input {
  width: 260px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  color: var(--ink);
}
.icon-button {
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 17px;
  cursor: pointer;
}
.gm-badge {
  background: var(--accent);
  color: var(--accent-foreground);
  font: 700 10px "DM Mono", monospace;
  padding: 3px 7px;
  border-radius: 2px;
}
.activity-notifications {
  position: relative;
  flex: 0 0 auto;
}
.notification-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.notification-trigger:hover,
.notification-trigger:focus-visible {
  border-color: var(--accent);
  outline: none;
}
.notification-count {
  display: inline-grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-foreground);
  font-size: 10px;
  font-weight: 700;
}
.notification-popover {
  position: absolute;
  z-index: 60;
  top: calc(100% + 10px);
  right: 0;
  width: min(360px, calc(100vw - 24px));
  max-height: min(70vh, 520px);
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  box-shadow: 0 12px 36px #0003;
}
.notification-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 10px;
  border-bottom: 1px solid var(--line);
}
.notification-empty {
  margin: 0;
  padding: 18px 8px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.notification-error {
  color: var(--error);
}
.notification-item {
  display: block;
  width: 100%;
  padding: 11px 8px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.notification-item:last-child {
  border-bottom: 0;
}
.notification-item:hover,
.notification-item:focus-visible {
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  outline: none;
}
.notification-item strong,
.notification-item span,
.notification-item p {
  display: block;
  overflow-wrap: anywhere;
}
.notification-item strong {
  margin-bottom: 4px;
  font-size: 12px;
}
.notification-item span,
.notification-item p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.notification-item p {
  display: -webkit-box;
  margin-top: 4px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.gm-email {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 11px;
}
.topbar-fixed-actions {
  position: fixed;
  z-index: 30;
  bottom: 18px;
  left: 14px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 192px;
}
.topbar-action,
.topbar-logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.topbar-action {
  justify-content: flex-start;
  width: 100%;
  border-color: transparent;
  background: var(--navy);
  color: var(--nav-muted);
}
.topbar-action:hover,
.topbar-logout:hover {
  border-color: var(--accent);
  color: var(--ink);
}
.topbar-logout {
  border-color: color-mix(in srgb, var(--error) 35%, var(--line));
  color: var(--error);
}
.main-content {
  flex: 1;
  padding: 28px;
  overflow-y: auto;
}
.tracker-reminder-ad {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin: 16px 28px 0;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
  border-left: 4px solid var(--accent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 7%, var(--panel));
  box-shadow: 0 5px 18px rgb(30 24 20 / 7%);
  animation: tracker-reminder-enter 0.35s ease-out both;
}
.tracker-reminder-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.tracker-reminder-label {
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tracker-reminder-copy > strong {
  color: var(--ink);
  font-size: 15px;
}
.tracker-reminder-subtitle,
.tracker-reminder-links .muted {
  color: var(--muted);
  font-size: 12px;
}
.tracker-reminder-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px 14px;
  margin-top: 5px;
}
.tracker-reminder-link {
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.tracker-reminder-link:hover {
  color: var(--ink);
}
.tracker-reminder-dismiss {
  display: grid;
  flex: 0 0 30px;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  font-size: 22px;
  cursor: pointer;
}
.tracker-reminder-dismiss:hover,
.tracker-reminder-dismiss:focus-visible {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--ink);
}
@keyframes tracker-reminder-enter {
  from {
    opacity: 0;
    transform: translateY(-7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.global-loading,
.no-campaign {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 60vh;
  color: var(--muted);
  text-align: center;
}
.no-campaign h2 {
  color: var(--ink);
}
.load-warning {
  margin: 0 0 18px;
  padding: 14px 18px;
  border: 1px solid var(--warning);
  border-radius: 4px;
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}
.load-warning ul {
  margin: 8px 0;
  padding-left: 20px;
}
.search-overlay {
  position: fixed;
  z-index: 50;
  top: 72px;
  right: 24px;
  width: min(560px, calc(100vw - 280px));
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}
.toast {
  position: fixed;
  z-index: 100;
  right: 24px;
  bottom: 24px;
  max-width: calc(100vw - 48px);
  padding: 13px 18px;
  border-radius: 5px;
  background: var(--navy);
  color: #fff;
  box-shadow: 0 4px 20px #0002;
}
.toast--success {
  border-left: 4px solid var(--success);
}
.toast--error {
  border-left: 4px solid var(--error);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
@media (max-width: 768px) {
  .app-shell {
    display: block;
    min-height: 100dvh;
  }
  .sidebar {
    width: 100%;
    height: auto;
    position: static;
    padding: 12px 14px 8px;
    overflow: visible;
  }
  .brand {
    padding: 0 4px 10px;
  }
  .side-nav {
    flex-direction: row;
    flex: 0 0 calc(100% + 28px);
    width: calc(100% + 28px);
    margin: 0 -14px;
    padding: 0 10px 8px;
    overflow-x: auto;
    overflow-y: hidden;
    flex-wrap: nowrap;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }
  .nav-item {
    flex: 0 0 auto;
    min-height: 42px;
    padding: 10px 12px;
    white-space: nowrap;
  }
  .sidebar-bottom {
    display: none;
  }
  .main-content {
    min-width: 0;
    overflow: visible;
    padding: 16px 14px calc(76px + env(safe-area-inset-bottom));
  }
  .preview-banner {
    margin: 0 12px;
  }
  .tracker-reminder-ad {
    gap: 8px;
    margin: 12px 12px 0;
    padding: 13px 12px;
  }
  .tracker-reminder-copy > strong {
    font-size: 14px;
  }
  .tracker-reminder-links {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .topbar {
    flex-wrap: wrap;
    align-items: flex-start;
    padding: 12px 16px;
    gap: 8px;
  }
  .topbar-left {
    flex: 1 1 100%;
  }
  .topbar-right {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
  .topbar-fixed-actions {
    position: fixed;
    top: auto;
    right: auto;
    bottom: calc(12px + env(safe-area-inset-bottom));
    left: 10px;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    width: auto;
  }
  .topbar-action,
  .topbar-logout {
    min-height: 30px;
    padding: 5px 7px;
    font-size: 10px;
  }
  .topbar-action {
    width: auto;
  }
  .topbar-title {
    font-size: 16px;
  }
  .topbar-right {
    gap: 6px;
  }
  .notification-trigger {
    min-height: 32px;
    gap: 4px;
    padding: 5px 7px;
    font-size: 11px;
  }
  .notification-popover {
    right: -44px;
  }
  .search-input {
    width: min(48vw, 240px);
  }
  .gm-email {
    display: none;
  }
  .search-overlay {
    top: 64px;
    right: 16px;
    width: calc(100vw - 32px);
  }
}
@media (max-width: 420px) {
  .sidebar {
    padding-inline: 10px;
  }
  .side-nav {
    flex-basis: calc(100% + 20px);
    width: calc(100% + 20px);
    margin-inline: -10px;
    padding-inline: 8px;
  }
  .main-content {
    padding-inline: 10px;
  }
  .topbar {
    padding-inline: 12px;
  }
  .topbar-right {
    gap: 5px;
  }
  .topbar-logout {
    padding-inline: 6px;
  }
  .notification-popover {
    right: -54px;
  }
  .breadcrumb {
    font-size: 9px !important;
  }
  .card {
    padding: 14px;
  }
}
</style>
