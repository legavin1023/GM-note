import { createRouter, createWebHashHistory } from "vue-router";
import { supabase } from "@/supabase";

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

const routes = [
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { requiresGuest: true },
  },
  {
    path: "/player-login",
    name: "player-login",
    component: LoginView,
    props: { playerMode: true },
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
        redirect: "/master",
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
        path: "gallery",
        name: "gallery",
        component: GalleryView,
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/master",
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
    const { data: context } = await supabase.rpc("player_team_context");
    return { name: Array.isArray(context) && context.length ? "scenarios" : "master" };
  }
  if (isAuthenticated) {
    const { data: context, error } = await supabase.rpc("player_team_context");
    if (!error && Array.isArray(context) && context.length) {
      const allowed = ["scenarios", "scenario-detail", "team-detail"];
      if (!allowed.includes(to.name)) return { name: "scenarios" };
      if (to.name === "team-detail" && to.params.teamId !== context[0].team_id) {
        return { name: "team-detail", params: { teamId: context[0].team_id }, replace: true };
      }
      if (to.name === "scenario-detail" && to.query.teamId !== context[0].team_id) {
        return { name: "scenarios" };
      }
      if (to.name === "scenario-detail" && !/^\d+$/.test(String(to.params.scenarioId))) {
        return { name: "scenarios" };
      }
    }
  }
});

export default router;
