// Never print raw responses, credentials, deployment URLs or exception objects.
import { writeFile, mkdir, readFile } from "node:fs/promises";
const env = process.env;
const site = env.SUPABASE_URL || env.VUE_APP_SUPABASE_URL;
const key = env.SUPABASE_ANON_KEY || env.VUE_APP_SUPABASE_ANON_KEY;
if (process.argv.includes("--prepare-paste")) {
  await mkdir("data/drive-diagnostics", { recursive: true });
  const protocol = (
    await readFile("supabase/functions/drive-image-upload/protocol.mjs", "utf8")
  ).replace(/^export /gm, "");
  const entry = (
    await readFile("supabase/functions/drive-image-upload/index.ts", "utf8")
  ).replace(/^import\s+[^;]+?\s+from\s+["']\.\/protocol\.mjs["'];?\r?\n/m, "");
  await writeFile(
    "data/drive-diagnostics/drive-image-upload.paste.ts",
    protocol + "\n" + entry
  );
  console.log(
    "Prepared data/drive-diagnostics/drive-image-upload.paste.ts (entire dashboard index.ts)"
  );
} else {
  if (!site || !key)
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_ANON_KEY, or load the frontend .env with node --env-file=.env"
    );
  const body = { action: "diagnose" };
  if (process.argv.includes("--upload-test")) {
    Object.assign(body, {
      action: "upload",
      kind: "gallery",
      operationId: env.DRIVE_TEST_OPERATION_ID || crypto.randomUUID(),
      name: "gm-drive-diagnostic.png",
      mimeType: "image/png",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    });
  }
  try {
    const response = await fetch(
      new URL("/functions/v1/drive-image-upload", site),
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${env.DRIVE_TEST_ACCESS_TOKEN || key}`,
          "Content-Type": "application/json",
          Origin: "https://legavin1023.github.io",
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(65000),
      }
    );
    const result = await response.json().catch(() => ({}));
    const safe = {
      http: response.status,
      ok: result.ok === true,
      code: /^[A-Z_]+$/.test(result.code || "") ? result.code : null,
      requestId: /^[\w-]{16,100}$/.test(result.requestId || "")
        ? result.requestId
        : null,
      version: /^[\w-]{1,80}$/.test(result.version || "")
        ? result.version
        : null,
      cors:
        response.headers.get("access-control-allow-origin") ===
        "https://legavin1023.github.io",
    };
    if (body.action === "upload" && result.ok === true) {
      await mkdir("data/drive-diagnostics", { recursive: true });
      await writeFile(
        "data/drive-diagnostics/upload-result.json",
        JSON.stringify(
          {
            ...safe,
            id: result.id,
            url: result.url,
            operationId: body.operationId,
          },
          null,
          2
        ),
        { mode: 0o600 }
      );
    }
    console.log(JSON.stringify(safe, null, 2));
    if (!response.ok || !safe.ok) process.exitCode = 1;
  } catch {
    console.error(
      "NETWORK_FAILED: remote response could not be inspected; private details suppressed"
    );
    process.exitCode = 1;
  }
}
