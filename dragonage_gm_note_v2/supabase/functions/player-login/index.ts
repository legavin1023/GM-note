import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    const { username, password } = await req.json();
    const loginUsername = String(username || "").trim();
    if (!loginUsername || typeof password !== "string" || !password) {
      return Response.json({ error: "Username and password are required" }, { status: 400, headers: corsHeaders });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: membership, error: membershipError } = await admin
      .from("player_team_members")
      .select("user_id")
      .eq("login_username", loginUsername)
      .maybeSingle();
    if (membershipError || !membership) {
      return Response.json({ error: "Invalid username or password" }, { status: 401, headers: corsHeaders });
    }

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(membership.user_id);
    const email = userResult?.user?.email;
    if (userError || !email) {
      return Response.json({ error: "Invalid username or password" }, { status: 401, headers: corsHeaders });
    }

    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return Response.json({ error: "Invalid username or password" }, { status: 401, headers: corsHeaders });
    }

    return Response.json(data.session, { headers: corsHeaders });
  } catch {
    return Response.json({ error: "Unable to sign in" }, { status: 400, headers: corsHeaders });
  }
});
