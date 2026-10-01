import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VUE_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.VUE_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase URL and Anon Key are missing. " +
      "Make sure to create a .env file with VUE_APP_SUPABASE_URL and VUE_APP_SUPABASE_ANON_KEY."
  );
}

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default {
  install: (app) => {
    app.config.globalProperties.$supabase = supabase;
  },
};

export { supabase, supabaseUrl, supabaseAnonKey };
