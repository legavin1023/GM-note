// Narrow deployment helper: uses the logged-in CLI and system trusted CAs.
// Never prints private keys, CLI credentials or webhook trigger arguments.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const tls = require("node:tls");
const { spawnSync } = require("node:child_process");
const { createECDH, randomBytes } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const projectRef = "cammbwzdpymunyobvszu";
const siteUrl = "https://legavin1023.github.io/GM-note/";
const caFile = path.join(os.tmpdir(), "webpush-system-ca.pem");
fs.writeFileSync(caFile, tls.getCACertificates("system").join("\n"));
const cliEnv = {
  ...process.env,
  NODE_EXTRA_CA_CERTS: caFile,
  NODE_USE_SYSTEM_CA: "1",
};
function cli(args, print = true) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/supabase/dist/supabase.js"), ...args],
    {
      cwd: root,
      env: cliEnv,
      encoding: "utf8",
      timeout: 180000,
    }
  );
  if (result.error || result.status !== 0) {
    if (action === "inspect" || action === "test-team-update" || action === "deactivate-players" || action === "test-deactivation" || (action === "verify-expansion" && args.includes("supabase/test_notification_expansion.sql")))
      console.error(
        [result.stderr,result.stdout,result.error?.message].filter(Boolean).join("\n").trim()
      );
    // CLI errors can echo inputs; keep them out of logs when inputs contain secrets.
    throw new Error(
      `Supabase ${args.slice(0, 2).join(" ")} failed (exit ${
        result.status
      }); no sensitive output printed`
    );
  }
  if (print) console.log(result.stdout.trim());
  return result.stdout;
}
const queryFile = (file, print = true) =>
  cli(
    ["db", "query", "--linked", "--project-ref", projectRef, "--file", file],
    print
  );
const parseEnv = (text) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, "")])
  );
const privateFile = path.join(root, "supabase/functions/.env");
const pushNames = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "PUSH_WEBHOOK_SECRET",
  "PUSH_SITE_URL",
];
const action = process.argv[2];
async function main() {
  try {
    if (action === "migrate-board-freeze-delivery") {
      queryFile("supabase/migration_push_team_freeze_compat.sql");
      queryFile("supabase/diagnostics_board_delivery.sql");
    } else if (action === "repair-board-freeze-delivery") {
      cli(["functions","deploy","new-post-push","--project-ref",projectRef,"--no-verify-jwt","--use-api"]);
      cli(["functions","deploy","discord-posts","--project-ref",projectRef,"--no-verify-jwt","--use-api"]);
      queryFile("supabase/migration_push_team_freeze_compat.sql");
      queryFile("supabase/diagnostics_board_delivery.sql");
    } else if (action === "inspect-board-delivery") {
      queryFile("supabase/diagnostics_board_delivery.sql");
    } else if (action === "fix-team-freeze") {
      queryFile("supabase/migration_team_freeze.sql");
      queryFile("supabase/verify_team_freeze.sql");
    } else if (action === "deactivate-players") {
      queryFile("supabase/migration_player_deactivation.sql");
      cli(["functions","deploy","player-login","--project-ref",projectRef,"--no-verify-jwt","--use-api"]);
    } else if(action === "test-deactivation") {
      queryFile("supabase/test_player_deactivation.sql");
    } else if (action === "inspect-team-update") {
      queryFile("supabase/diagnostics_team_update.sql");
    } else if(action === "test-team-update") {
      queryFile("supabase/test_team_update.sql");
    } else if(action === "fix-team-update") {
      queryFile("supabase/migration_fix_teams_policy_recursion.sql");
    } else if (action === "prepare-discord") {
      const original=fs.readFileSync(path.join(root,".backup-tools/discord-original/supabase/functions/smooth-responder/index.ts"),"utf8");
      const old=original.match(/fetch\(\s*["']([^"']+)["']/)?.[1];
      const env=parseEnv(fs.readFileSync(path.join(root,".env"),"utf8"));
      let selected;
      const privateEnv=parseEnv(fs.readFileSync(privateFile,"utf8"));
      for(const [name,url] of [["New notice webhook",privateEnv.DISCORD_NOTICE_WEBHOOK_URL],["Existing notice webhook",old],["Configured board webhook",env.DISCORD_WEBHOOK_URL]]) {
        if(!url)continue;const parsed=new URL(url);if(parsed.hostname!=="discord.com"||!parsed.pathname.startsWith("/api/webhooks/"))continue;
        const response=await fetch(url,{signal:AbortSignal.timeout(10000)});await response.body?.cancel();console.log(name,"HTTP",response.status);
        if(response.ok && !selected)selected=url;
      }
      if(!selected)throw new Error("No working Discord webhook available");
      const secretFile=path.join(os.tmpdir(),`discord-secret-${randomBytes(8).toString("hex")}.env`);
      try {fs.writeFileSync(secretFile,`DISCORD_NOTICE_WEBHOOK_URL=${selected}\n`);cli(["secrets","set","--project-ref",projectRef,"--env-file",secretFile],false);}finally{fs.unlinkSync(secretFile);}
      console.log("Working Discord notice webhook stored in server Secret");
    } else if(action === "repair-board-discord") {
      const env=parseEnv(fs.readFileSync(privateFile,"utf8"));
      const webhook=env.DISCORD_POST_WEBHOOK_URL||env.DISCORD_NOTICE_WEBHOOK_URL;
      if(!webhook)throw new Error("No Discord webhook configured");
      const parsed=new URL(webhook);if(parsed.hostname!=="discord.com"||!parsed.pathname.startsWith("/api/webhooks/"))throw new Error("Invalid Discord webhook");
      const response=await fetch(webhook);await response.body?.cancel();if(!response.ok)throw new Error(`Discord webhook HTTP ${response.status}`);
      const file=path.join(os.tmpdir(),`discord-post-secret-${randomBytes(8).toString("hex")}.env`);
      try{fs.writeFileSync(file,`DISCORD_POST_WEBHOOK_URL=${webhook}\n`);cli(["secrets","set","--project-ref",projectRef,"--env-file",file],false);}finally{fs.unlinkSync(file);}
      cli(["functions","deploy","discord-posts","--project-ref",projectRef,"--no-verify-jwt","--use-api"]);
      queryFile("supabase/migration_discord_posts.sql");
    } else if(action === "migrate-board-discord") {
      queryFile("supabase/migration_discord_posts.sql");
    } else if(action === "verify-board-discord") {
      const local=parseEnv(fs.readFileSync(privateFile,"utf8"));
      const response=await fetch(`https://${projectRef}.supabase.co/functions/v1/discord-posts`,{method:"POST",headers:{"Content-Type":"application/json","x-push-webhook-secret":local.PUSH_WEBHOOK_SECRET},body:JSON.stringify({action:"drain"})});
      console.log("Board Discord function HTTP",response.status);await response.body?.cancel();if(!response.ok)throw new Error("Board Discord verification failed");
      queryFile("supabase/verify_discord_posts.sql");
    } else if(action === "verify-discord") {
      const local=parseEnv(fs.readFileSync(privateFile,"utf8"));
      const url=`https://${projectRef}.supabase.co/functions/v1/discord-notices`;
      for(const check of [{headers:{},body:{action:"drain"},expected:401},{headers:{"x-push-webhook-secret":local.PUSH_WEBHOOK_SECRET},body:{action:"drain"},expected:200}]) {
        const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",...check.headers},body:JSON.stringify(check.body),signal:AbortSignal.timeout(90000)});
        console.log("Discord function HTTP",r.status);await r.body?.cancel();if(r.status!==check.expected)throw new Error("Discord function verification failed");
      }
      const file=path.join(os.tmpdir(),`discord-verify-${randomBytes(8).toString("hex")}.sql`);
      try {
        fs.writeFileSync(file,"SELECT n.id,n.created_at,d.sent_at,d.message_id FROM public.notices n LEFT JOIN public.discord_notice_deliveries d ON d.notice_id=n.id ORDER BY n.created_at DESC,n.id DESC LIMIT 1;");
        const row=JSON.parse(queryFile(file,false)).rows[0];
        if(!row?.sent_at || !row?.message_id)throw new Error("Latest notice has no successful Discord receipt yet");
        const webhook=new URL(local.DISCORD_NOTICE_WEBHOOK_URL);webhook.search='';webhook.pathname+=`/messages/${encodeURIComponent(row.message_id)}`;
        const response=await fetch(webhook.href,{signal:AbortSignal.timeout(15000)});
        const message=await response.json();
        if(!response.ok || message.id!==row.message_id || !message.embeds?.[0]?.url?.endsWith(`/notices/${row.id}`))throw new Error("Discord message read-back verification failed");
        console.log("Latest notice successfully delivered and read back from Discord; message ID:",row.message_id);
        fs.writeFileSync(file,"SELECT (SELECT jsonb_agg(jsonb_build_object('name',jobname,'active',active)) FROM cron.job WHERE jobname='discord-notice-retry') AS cron, (SELECT array_agg(tgname) FROM pg_trigger WHERE tgrelid='public.notices'::regclass AND NOT tgisinternal) AS notice_triggers;");queryFile(file);
      }finally{fs.unlinkSync(file);}
    } else if(action === "isolate-sessions") {
      queryFile("supabase/migration_team_session_isolation.sql");
    } else if(action === "deploy-discord") {
      cli(["functions","deploy","discord-notices","--project-ref",projectRef,"--no-verify-jwt","--use-api"]);
      queryFile("supabase/migration_discord_notices.sql");
    } else if (action === "download-discord") {
      const dir=path.join(root,".backup-tools/discord-original");fs.mkdirSync(dir,{recursive:true});
      cli(["functions","download","smooth-responder","--project-ref",projectRef,"--use-api","--workdir",dir],false);
      const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
      for(const file of walk(dir).filter(f=>f.endsWith(".ts")))console.log(fs.readFileSync(file,"utf8").replace(/https:\/\/[^\s'"`]+/g,"[URL redacted]"));
    } else if (action === "inspect-discord") {
      const files=[".env",".env.local","supabase/functions/.env"];
      for(const file of files){const full=path.join(root,file);if(fs.existsSync(full)){const env=parseEnv(fs.readFileSync(full,"utf8"));console.log(file,"Discord webhook configured:",Boolean(env.DISCORD_WEBHOOK_URL));}}
      const temp=path.join(os.tmpdir(),`discord-inspect-${randomBytes(8).toString("hex")}.sql`);
      try{fs.writeFileSync(temp,"SELECT (SELECT array_agg(tgname) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.notices'::regclass,'public.team_art_posts'::regclass)) AS triggers,(SELECT array_agg(name) FROM vault.secrets) AS vault_names;");queryFile(temp);}finally{fs.unlinkSync(temp);}
      const detail=path.join(os.tmpdir(),`discord-detail-${randomBytes(8).toString("hex")}.sql`);
      try{
        fs.writeFileSync(detail,"SELECT t.tgname,p.proname,encode(t.tgargs,'escape') AS args FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgname='discord-notices-notification';");
        const rows=JSON.parse(queryFile(detail,false)).rows;
        for(const row of rows){const args=row.args.split('\\000');let host='custom',route='custom';try{const url=new URL(args[0]);host=url.hostname;route=host.endsWith('.supabase.co')?url.pathname:'private webhook';}catch{}console.log('Existing notice Discord trigger:',row.tgname,'function:',row.proname,'destination host:',host,'route:',route,'method:',args[1]);}
        cli(["functions","list","--project-ref",projectRef]);
        fs.writeFileSync(detail,"SELECT id,status_code,timed_out FROM net._http_response ORDER BY id DESC LIMIT 8;");queryFile(detail);
      }finally{fs.unlinkSync(detail);}
    } else if (action === "inspect-expansion") {
      queryFile("supabase/diagnostics_notification_expansion.sql");
    } else if (action === "deploy-expansion") {
      cli(["functions","deploy","campaign-push","--project-ref",projectRef,"--no-verify-jwt","--use-api"]);
    } else if (action === "migrate-expansion") {
      queryFile("supabase/migration_push_notice_session_activity.sql");
    } else if (action === "verify-expansion") {
      queryFile("supabase/verify_notification_expansion.sql");
      queryFile("supabase/test_notification_expansion.sql");
      const local = parseEnv(fs.readFileSync(privateFile, "utf8"));
      const url=`https://${projectRef}.supabase.co/functions/v1/campaign-push`;
      for(const check of [{headers:{},body:{},expected:401},{headers:{"x-push-webhook-secret":local.PUSH_WEBHOOK_SECRET},body:{},expected:400},{headers:{"x-push-webhook-secret":local.PUSH_WEBHOOK_SECRET},body:{action:"drain"},expected:200}]) {
        const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",...check.headers},body:JSON.stringify(check.body)});
        await response.body?.cancel();console.log("Campaign function HTTP",response.status);if(response.status!==check.expected)throw new Error("Function authentication verification failed");
      }
      const file=path.join(os.tmpdir(),`campaign-push-verify-${randomBytes(8).toString("hex")}.sql`);
      try {
        fs.writeFileSync(file,`SELECT net.http_post(url := '${url}', headers := jsonb_build_object('Content-Type','application/json','x-push-webhook-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='web_push_webhook_secret' LIMIT 1)), body := '{"action":"drain"}'::jsonb, timeout_milliseconds := 100000) AS request_id;`);
        const id=Number(JSON.parse(queryFile(file,false)).rows[0].request_id);
        if(!Number.isSafeInteger(id))throw new Error("Invalid request ID");
        let result;
        for(let attempt=0;attempt<6;attempt++) {
          await new Promise(resolve=>setTimeout(resolve,500));
          fs.writeFileSync(file,`SELECT status_code,timed_out FROM net._http_response WHERE id=${id};`);
          result=JSON.parse(queryFile(file,false)).rows[0];if(result)break;
        }
        console.log("Database → campaign-push:",result?.status_code,"timed_out:",result?.timed_out);
        if(result?.status_code!==200 || result?.timed_out)throw new Error("Database campaign function verification failed");
      } finally {if(fs.existsSync(file))fs.unlinkSync(file);}
    } else if (action === "inspect") {
      queryFile("supabase/diagnostics_web_push.sql");
      cli(["functions", "list", "--project-ref", projectRef]);
      const secrets = JSON.parse(
        cli(["secrets", "list", "--project-ref", projectRef], false)
      );
      console.log(
        "Server Secret names:",
        secrets.secrets.map((item) => item.name).join(", ")
      );
    } else if (action === "prepare") {
      const remote = JSON.parse(
        cli(["secrets", "list", "--project-ref", projectRef], false)
      );
      let local = fs.existsSync(privateFile)
        ? parseEnv(fs.readFileSync(privateFile, "utf8"))
        : {};
      if (!pushNames.every((name) => local[name])) {
        if (remote.secrets.some((secret) => pushNames.includes(secret.name)))
          throw new Error(
            "Existing remote Push secrets found; refusing to replace unknown VAPID keys"
          );
        const key = createECDH("prime256v1");
        key.generateKeys();
        local = {
          ...local,
          VAPID_PUBLIC_KEY: key.getPublicKey().toString("base64url"),
          VAPID_PRIVATE_KEY: key.getPrivateKey().toString("base64url"),
          VAPID_SUBJECT: siteUrl,
          PUSH_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
          PUSH_SITE_URL: siteUrl,
        };
        const existing = fs.existsSync(privateFile)
          ? fs.readFileSync(privateFile, "utf8")
          : "";
        const kept = existing
          .split(/\r?\n/)
          .filter(
            (line) => !pushNames.some((name) => line.startsWith(`${name}=`))
          )
          .join("\n");
        fs.writeFileSync(
          privateFile,
          `${kept}\n${pushNames
            .map((name) => `${name}=${local[name]}`)
            .join("\n")}\n`
        );
      }
      const frontendFile = path.join(root, ".env");
      const frontend = fs.readFileSync(frontendFile, "utf8");
      const publicFile = path.join(root, ".env.local");
      const publicEnv = fs.existsSync(publicFile)
        ? fs.readFileSync(publicFile, "utf8")
        : "";
      if (
        !{
          ...parseEnv(frontend),
          ...parseEnv(publicEnv),
        }.VUE_APP_SUPABASE_URL?.includes(projectRef)
      )
        throw new Error("Frontend project does not match target");
      const line = `VUE_APP_VAPID_PUBLIC_KEY=${local.VAPID_PUBLIC_KEY}`;
      fs.writeFileSync(
        publicFile,
        /^VUE_APP_VAPID_PUBLIC_KEY=.*$/m.test(publicEnv)
          ? publicEnv.replace(/^VUE_APP_VAPID_PUBLIC_KEY=.*$/m, line)
          : `${publicEnv.trimEnd()}\n${line}\n`
      );
      // Undo only this helper's earlier public-key addition to the tracked .env.
      const original = spawnSync("git", ["show", "HEAD:./.env"], {
        cwd: root,
        encoding: "utf8",
      });
      if (
        original.status === 0 &&
        !/^VUE_APP_VAPID_PUBLIC_KEY=/m.test(original.stdout) &&
        frontend
          .replace(/^VUE_APP_VAPID_PUBLIC_KEY=.*\r?\n?/gm, "")
          .trimEnd() === original.stdout.trimEnd()
      ) {
        fs.writeFileSync(frontendFile, original.stdout);
      }
      console.log(
        "VAPID keys saved to ignored functions/.env; frontend public key configured. No secrets printed."
      );
    } else if (action === "secrets") {
      const local = parseEnv(fs.readFileSync(privateFile, "utf8"));
      if (!pushNames.every((name) => local[name]))
        throw new Error("Run prepare first");
      const tempFile = path.join(
        os.tmpdir(),
        `webpush-secrets-${randomBytes(8).toString("hex")}.env`
      );
      try {
        fs.writeFileSync(
          tempFile,
          pushNames.map((name) => `${name}=${local[name]}`).join("\n")
        );
        cli(
          [
            "secrets",
            "set",
            "--project-ref",
            projectRef,
            "--env-file",
            tempFile,
          ],
          false
        );
        console.log("The five Web Push server Secrets were registered.");
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    } else if (action === "webhook") {
      const local = parseEnv(fs.readFileSync(privateFile, "utf8"));
      if (!local.PUSH_WEBHOOK_SECRET) throw new Error("Run prepare first");
      const secretLiteral = local.PUSH_WEBHOOK_SECRET.replace(/'/g, "''");
      const tempFile = path.join(
        os.tmpdir(),
        `webpush-webhook-${randomBytes(8).toString("hex")}.sql`
      );
      try {
        const sql = `BEGIN; DO $vault$ DECLARE existing uuid; BEGIN SELECT id INTO existing FROM vault.secrets WHERE name = 'web_push_webhook_secret' LIMIT 1; IF existing IS NULL THEN PERFORM vault.create_secret('${secretLiteral}', 'web_push_webhook_secret', 'Database Web Push authentication'); ELSE PERFORM vault.update_secret(existing, '${secretLiteral}'); END IF; END $vault$;\n`;
        fs.writeFileSync(
          tempFile,
          sql +
            fs.readFileSync(
              path.join(root, "supabase/web_push_webhook.sql"),
              "utf8"
            ) +
            "\nCOMMIT;"
        );
        queryFile(tempFile, false);
        console.log(
          "INSERT Webhook installed; authentication secret stored encrypted in Supabase Vault."
        );
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    } else if (action === "migrate") {
      queryFile("supabase/migration_web_push.sql");
      queryFile("supabase/migration_web_push_preferences.sql");
    } else if (action === "preferences") {
      queryFile("supabase/migration_web_push_preferences.sql");
    } else if (action === "deploy") {
      cli([
        "functions",
        "deploy",
        "new-post-push",
        "--project-ref",
        projectRef,
        "--no-verify-jwt",
        "--use-api",
      ]);
    } else if (action === "verify-site") {
      const localHtml = fs.readFileSync(
        path.join(root, "dist/index.html"),
        "utf8"
      );
      const appFile = localHtml.match(/js\/app\.[a-f0-9]+\.js/)[0];
      let ready = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        const suffix = `?webpush_check=${Date.now()}`;
        const [page, worker, manifest] = await Promise.all([
          fetch(siteUrl + suffix),
          fetch(siteUrl + "sw.js" + suffix),
          fetch(siteUrl + "manifest.webmanifest" + suffix),
        ]);
        const [html, workerText, manifestText] = await Promise.all([
          page.text(),
          worker.text(),
          manifest.text(),
        ]);
        ready =
          page.ok &&
          worker.ok &&
          manifest.ok &&
          html.includes(appFile) &&
          workerText.includes("내 글에 댓글이 달렸어요") &&
          manifestText.includes("standalone");
        if (ready) break;
        console.log(
          `Pages deployment propagation check ${attempt + 1}: waiting`
        );
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      if (!ready)
        throw new Error("GitHub Pages has not propagated the new build yet");
      console.log(
        "GitHub Pages: new app build, comment-aware Service Worker and PWA manifest verified."
      );
    } else if (action === "verify") {
      queryFile("supabase/verify_web_push.sql");
      const local = parseEnv(fs.readFileSync(privateFile, "utf8"));
      const functionUrl = `https://${projectRef}.supabase.co/functions/v1/new-post-push`;
      const event = {
        type: "INSERT",
        schema: "public",
        table: "team_art_posts",
        record: { id: "00000000-0000-0000-0000-000000000000" },
      };
      const requests = [
        { name: "Unauthorized request", headers: {}, body: {}, expected: 401 },
        {
          name: "Invalid event",
          headers: { "x-push-webhook-secret": local.PUSH_WEBHOOK_SECRET },
          body: {},
          expected: 400,
        },
        {
          name: "Authenticated missing-post check (no notifications)",
          headers: { "x-push-webhook-secret": local.PUSH_WEBHOOK_SECRET },
          body: event,
          expected: 200,
        },
        {
          name: "Authenticated missing-comment check (no notifications)",
          headers: { "x-push-webhook-secret": local.PUSH_WEBHOOK_SECRET },
          body: { ...event, table: "team_art_comments" },
          expected: 200,
        },
      ];
      for (const check of requests) {
        const response = await fetch(functionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...check.headers },
          body: JSON.stringify(check.body),
          signal: AbortSignal.timeout(30000),
        });
        await response.body?.cancel();
        console.log(`${check.name}: HTTP ${response.status}`);
        if (response.status !== check.expected)
          throw new Error("Deployed function verification failed");
      }
      // Exercise the same pg_net + Vault route without inserting a post or sending push.
      const tempFile = path.join(
        os.tmpdir(),
        `webpush-verify-${randomBytes(8).toString("hex")}.sql`
      );
      try {
        fs.writeFileSync(
          tempFile,
          `SELECT net.http_post(url := '${functionUrl}', headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'web_push_webhook_secret' LIMIT 1)), body := '${JSON.stringify(
            event
          )}'::jsonb, timeout_milliseconds := 30000) AS request_id;`
        );
        const enqueue = JSON.parse(queryFile(tempFile, false));
        const requestId = Number(enqueue.rows[0].request_id);
        if (!Number.isSafeInteger(requestId))
          throw new Error("Invalid webhook request ID");
        let result;
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          fs.writeFileSync(
            tempFile,
            `SELECT status_code, timed_out FROM net._http_response WHERE id = ${requestId};`
          );
          const response = JSON.parse(queryFile(tempFile, false));
          result = response.rows[0];
          if (result) break;
        }
        console.log(
          "Database → Edge Function:",
          result
            ? `HTTP ${result.status_code}, timed_out=${result.timed_out}`
            : "No response yet"
        );
        if (result?.status_code !== 200 || result?.timed_out)
          throw new Error("Database Webhook verification failed");
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    } else {
      throw new Error(
        "Supported actions: inspect, prepare, migrate, preferences, secrets, deploy, webhook, verify, verify-site"
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
main();
