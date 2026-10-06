import { createStore } from "vuex";
import { supabase } from "@/supabase";

export default createStore({
  state: {
    // GM 인증 정보
    gmUser: null,
    userRole: null,
    playerTeamId: null,
    playerCharacterId: null,
    gmPlayerPreviewMode: false,
    gmPreviewTeamId: null,
    playerStageRecords: [],
    // 현재 캠페인
    campaign: null,
    // 팀 목록 (캐릭터 포함)
    teams: [],
    // 시나리오 목록 (questions, choices 포함)
    scenarios: [],
    progressStages: [],
    // 전역 로딩
    loading: false,
    // 전역 알림
    toast: null,
  },

  getters: {
    isAuthenticated: (state) => Boolean(state.gmUser),
    isMaster: (state) => state.userRole === "gm",
    isPlayerPreview: (state) =>
      state.userRole === "gm" && state.gmPlayerPreviewMode,
    isGM: (state) => state.userRole === "gm" && !state.gmPlayerPreviewMode,
    activePlayerTeamId: (state) =>
      state.userRole === "gm" && state.gmPlayerPreviewMode
        ? state.gmPreviewTeamId
        : state.playerTeamId,
    campaignId: (state) => state.campaign?.id || null,
    teamById: (state) => (id) => state.teams.find((t) => t.id === id) || null,
    scenarioById: (state) => (id) =>
      state.scenarios.find((s) => s.id === id) || null,
    // 팀 이름순 or sort_order 기준 정렬
    sortedTeams: (state) =>
      [...state.teams]
        .filter(
          (team) =>
            team.is_frozen !== true ||
            (state.userRole === "gm" && !state.gmPlayerPreviewMode)
        )
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    // 시나리오 sort_order 기준 정렬
    sortedScenarios: (state) =>
      [...state.scenarios].sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      ),
  },

  mutations: {
    setGmUser(state, user) {
      state.gmUser = user;
      if (!user) {
        state.gmPlayerPreviewMode = false;
        state.gmPreviewTeamId = null;
      }
    },
    setPlayerContext(state, payload) {
      if (!payload) {
        state.userRole = "gm";
        state.playerTeamId = null;
        state.playerCharacterId = null;
        return;
      }
      if (typeof payload === "string") {
        state.userRole = "player";
        state.playerTeamId = payload;
        return;
      }
      state.userRole = payload.teamId ? "player" : "gm";
      state.playerTeamId = payload.teamId || null;
      if (payload.characterId !== undefined) {
        state.playerCharacterId = payload.characterId || null;
      }
    },
    setGmPlayerPreview(state, enabled) {
      state.gmPlayerPreviewMode = Boolean(enabled);
      if (!enabled) state.gmPreviewTeamId = null;
    },
    setGmPreviewTeam(state, teamId) {
      state.gmPreviewTeamId = teamId || null;
    },
    setUserRole(state, role) {
      state.userRole = role === "gm" ? "gm" : "player";
    },
    setPlayerStageRecords(state, records) {
      state.playerStageRecords = records || [];
    },
    setCampaign(state, campaign) {
      state.campaign = campaign;
    },
    setTeams(state, teams) {
      state.teams = teams;
    },
    setScenarios(state, scenarios) {
      state.scenarios = scenarios;
    },
    setProgressStages(state, stages) {
      state.progressStages = stages;
    },
    updateTeam(state, updatedTeam) {
      const index = state.teams.findIndex((t) => t.id === updatedTeam.id);
      if (index !== -1) {
        state.teams.splice(index, 1, updatedTeam);
      }
    },
    addTeam(state, team) {
      state.teams.push(team);
    },
    removeTeam(state, teamId) {
      state.teams = state.teams.filter((t) => t.id !== teamId);
    },
    updateScenario(state, updatedScenario) {
      const index = state.scenarios.findIndex(
        (s) => s.id === updatedScenario.id
      );
      if (index !== -1) {
        state.scenarios.splice(index, 1, updatedScenario);
      } else {
        state.scenarios.push(updatedScenario);
      }
    },
    setLoading(state, value) {
      state.loading = value;
    },
    showToast(state, { message, type = "success" }) {
      state.toast = { message, type, id: Date.now() };
    },
    clearToast(state) {
      state.toast = null;
    },
  },

  actions: {
    // 세션 초기화
    async initSession({ commit }) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      commit("setGmUser", session?.user || null);
      return session?.user || null;
    },

    // 로그아웃
    async logout({ commit }) {
      await supabase.auth.signOut();
      commit("setGmUser", null);
      commit("setCampaign", null);
      commit("setTeams", []);
      commit("setScenarios", []);
    },

    // 토스트 표시 (자동 해제)
    showToast({ commit }, payload) {
      commit("showToast", payload);
      setTimeout(() => commit("clearToast"), 3500);
    },
  },

  modules: {},
});
