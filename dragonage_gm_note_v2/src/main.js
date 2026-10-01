import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import supabasePlugin from "./supabase";

createApp(App).use(store).use(router).use(supabasePlugin).mount("#app");
