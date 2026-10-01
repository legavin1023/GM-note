import { createStore } from "vuex";

export default createStore({
  state: {
    user: null,
    currentCampaign: null,
    teams: [],
    scenarios: [],
  },
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
  },
  mutations: {
    setUser(state, user) {
      state.user = user;
    },
    setCurrentCampaign(state, campaign) {
      state.currentCampaign = campaign;
    },
    setTeams(state, teams) {
      state.teams = teams;
    },
    setScenarios(state, scenarios) {
      state.scenarios = scenarios;
    },
  },
  actions: {},
  modules: {},
});
