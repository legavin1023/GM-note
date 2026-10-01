import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import supabase from "./supabase";

createApp(App).use(store).use(router).use(supabase).mount("#app");
