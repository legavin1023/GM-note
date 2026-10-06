import { createRouter, createWebHashHistory } from "vue-router";
import { supabase } from "@/supabase";
import store from "@/store";

// 지연 로딩으로 번들 분할
const LoginView = () => import("@/views/LoginView.vue");
const DashboardLayout = () => import("@/views/DashboardLayout.vue");
const TeamsView = () => import("@/views/TeamsView.vue");
const TeamDetailView = () => import("@/views/TeamDetailView.vue");
const CharactersView = () => import("@/views/CharactersView.vue");
const CharacterDetailView = () => import("@/views/CharacterDetailView.vue");
const ScenariosView = () => import("@/views/ScenariosView.vue");
const ScenarioDetailView = () => import("@/views/ScenarioDetailView.vue");
const MasterView = () => import("@/views/MasterView.vue");
const GalleryView = () => import("@/views/GalleryView.vue");
const FreeBoardView = () => import("@/views/FreeBoardView.vue");
const NoticesView = () => import("@/views/NoticesView.vue");
const HomeDashboardView = () => import("@/views/HomeDashboardView.vue");
const ScenarioNpcsView = () => import("@/views/ScenarioNpcsView.vue");
const NpcFeedbackView = () => import("@/views/NpcFeedbackView.vue");

const routes = [
  {
    path: "/login",
    name: "login",
    component: LoginView,
    props: { playerMode: true },
    meta: { requiresGuest: true },
  },
  {
    path: "/player-login",
    name: "player-login",
    redirect: { name: "login" },
  },
  {
    path: "/gm-login",
    name: "gm-login",
    component: LoginView,
    meta: { requiresGuest: true },
  },
  {
    path: "/",
    component: DashboardLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: "",
        name: "dashboard",
        redirect: "/home",
      },
      {
        path: "home",
        name: "home",
        component: HomeDashboardView,
      },
      {
        path: "master",
        name: "master",
        component: MasterView,
      },
      {
        path: "teams",
        name: "teams",
        component: TeamsView,
      },
      {
        path: "teams/:teamId",
        name: "team-detail",
        component: TeamDetailView,
        props: true,
      },
      {
        path: "characters",
        name: "characters",
        component: CharactersView,
      },
      {
        path: "characters/:characterId",
        name: "character-detail",
        component: CharacterDetailView,
        props: true,
      },
      {
        path: "scenarios",
        name: "scenarios",
        component: ScenariosView,
      },
      {
        path: "scenarios/:scenarioId",
        name: "scenario-detail",
        component: ScenarioDetailView,
        props: true,
      },
      {
        path: "scenarios/:scenarioId/npcs",
        name: "scenario-npcs",
        component: ScenarioNpcsView,
      },
      {
        path: "npcs/:npcId",
        name: "npc-feedback",
        component: NpcFeedbackView,
      },
      {
        path: "gallery",
        name: "gallery",
        component: GalleryView,
      },
      {
        path: "board/free",
        name: "free-board",
        component: FreeBoardView,
      },
      {
        path: "notices",
        name: "notices",
        component: NoticesView,
      },
      {
        path: "notices/new",
        name: "notice-create",
        component: NoticesView,
        meta: { requiresAdmin: true },
      },
      {
        path: "notices/:noticeId/edit",
        name: "notice-edit",
        component: NoticesView,
        props: true,
        meta: { requiresAdmin: true },
      },
      {
        path: "notices/:noticeId",
        name: "notice-detail",
        component: NoticesView,
        props: true,
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/home",
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

// 인증 가드
router.beforeEach(async (to) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const isAuthenticated = Boolean(session);

  if (to.meta.requiresAuth && !isAuthenticated) {
    return { name: "login" };
  }
  if (to.meta.requiresGuest && isAuthenticated) {
    const { data: isGm } = await supabase.rpc("current_user_is_gm");
    if (isGm) return { name: "home" };
    const { data: context } = await supabase.rpc("player_team_context");
    return {
      name: Array.isArray(context) && context.length ? "home" : "master",
    };
  }
  if (isAuthenticated) {
    const { data: isGm } = await supabase.rpc("current_user_is_gm");
    if (to.meta.requiresAdmin && !isGm) return { name: "notices" };
    if (isGm) {
      if (store.getters.isPlayerPreview) {
        if (["master", "teams", "character-detail"].includes(to.name)) {
          return {
            name: to.name === "character-detail" ? "characters" : "home",
          };
        }
        if (["notice-create", "notice-edit"].includes(to.name)) {
          return { name: "notices" };
        }
        const previewTeamId = store.getters.activePlayerTeamId;
        if (to.name === "scenario-npcs") {
          const stageNumber = Number(to.params.scenarioId);
          const team = store.getters.teamById(previewTeamId);
          if (
            !Number.isInteger(stageNumber) ||
            !team ||
            stageNumber >= (Number(team.progress_step) || 1)
          ) {
            return { name: "scenarios" };
          }
        }
        if (
          to.name === "team-detail" &&
          previewTeamId &&
          to.params.teamId !== previewTeamId
        ) {
          return {
            name: "team-detail",
            params: { teamId: previewTeamId },
            replace: true,
          };
        }
      }
      return true;
    }
    const { data: context, error } = await supabase.rpc("player_team_context");
    if (!error && Array.isArray(context) && context.length) {
      const allowed = [
        "home",
        "scenarios",
        "scenario-detail",
        "scenario-npcs",
        "npc-feedback",
        "team-detail",
        "characters",
        "gallery",
        "free-board",
        "notices",
        "notice-detail",
      ];
      if (!allowed.includes(to.name)) return { name: "home" };
      if (
        to.name === "team-detail" &&
        to.params.teamId !== context[0].team_id
      ) {
        return {
          name: "team-detail",
          params: { teamId: context[0].team_id },
          replace: true,
        };
      }
      if (
        to.name === "scenario-detail" &&
        to.query.teamId !== context[0].team_id
      ) {
        return { name: "scenarios" };
      }
      if (to.name === "scenario-detail") {
        const stepNumber = Number(to.params.scenarioId);
        // Players can edit prior stages only; the current and future stages
        // stay locked even when a direct link is entered.
        if (!Number.isInteger(stepNumber) || stepNumber < 1) {
          return { name: "scenarios" };
        }

        const { data: team, error: teamError } = await supabase
          .from("teams")
          .select("progress_step")
          .eq("id", context[0].team_id)
          .maybeSingle();
        if (
          teamError ||
          !team ||
          stepNumber >= (Number(team.progress_step) || 1)
        ) {
          return { name: "scenarios" };
        }
      }
      if (
        to.name === "scenario-detail" &&
        !/^\d+$/.test(String(to.params.scenarioId)) &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          String(to.params.scenarioId)
        )
      ) {
        return { name: "scenarios" };
      }
      if (to.name === "scenario-npcs") {
        const stepNumber = Number(to.params.scenarioId);
        if (!Number.isInteger(stepNumber) || stepNumber < 1) {
          return { name: "scenarios" };
        }
        const { data: team, error: teamError } = await supabase
          .from("teams")
          .select("progress_step")
          .eq("id", context[0].team_id)
          .maybeSingle();
        if (
          teamError ||
          !team ||
          stepNumber >= (Number(team.progress_step) || 1)
        ) {
          return { name: "scenarios" };
        }
      }
    }
  }
});

export default router;
