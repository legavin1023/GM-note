import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VUE_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.VUE_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수가 없습니다. .env 파일에 VUE_APP_SUPABASE_URL과 VUE_APP_SUPABASE_ANON_KEY를 설정하세요."
  );
}

if (process.env.NODE_ENV === "development") {
  let host = "invalid URL";
  try {
    host = new URL(supabaseUrl).host;
  } catch (_) {
    /* keep generic diagnostic */
  }
  console.info("[Supabase config]", {
    urlConfigured: true,
    host,
    anonKeyConfigured: true,
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default {
  install: (app) => {
    app.config.globalProperties.$supabase = supabase;
  },
};
