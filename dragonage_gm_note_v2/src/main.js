import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import supabasePlugin from "./supabase";
import { registerPushWorker } from "./services/push";

// Keep browser install prompts from interrupting visitors. Installation remains
// available through the browser menu; notification permission is click-only.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
});

createApp(App).use(store).use(router).use(supabasePlugin).mount("#app");
registerPushWorker().catch(() => {
  /* subscription UI reports registration errors */
});
