// Standalone: private backup repo needs no application dependencies.
export async function googleRequest(
  url,
  secret,
  body,
  { fetcher = fetch, timeout = 55000 } = {}
) {
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new Error("BACKUP_URL_INVALID");
  }
  if (
    target.origin !== "https://script.google.com" ||
    !/^\/macros\/s\/[\w-]+\/exec$/.test(target.pathname) ||
    target.search ||
    target.hash
  )
    throw new Error("BACKUP_URL_INVALID");
  try {
    const signal = AbortSignal.timeout(timeout);
    let response = await fetcher(target.href, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, secret, requestId: crypto.randomUUID() }),
      redirect: "manual",
      signal,
    });
    if ([302, 303].includes(response.status)) {
      const raw = response.headers.get("location"),
        next = raw ? new URL(raw, target) : null;
      await response.body?.cancel();
      if (
        next?.origin !== "https://script.googleusercontent.com" ||
        !next.pathname.startsWith("/macros/")
      )
        throw new Error("BACKUP_REDIRECT");
      response = await fetcher(next.href, {
        method: "GET",
        redirect: "error",
        signal,
      });
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("BACKUP_HTTP");
    }
    const result = await response.json();
    if (result?.ok !== true || result?.backupVersion !== "gm-backup-2026-11-11")
      throw new Error(
        /^(BACKUP_[A-Z_]{1,60})$/.test(result?.code || "")
          ? result.code
          : "BACKUP_RECEIPT"
      );
    return result;
  } catch (e) {
    throw new Error(
      /^BACKUP_[A-Z_]{1,60}$/.test(e?.message || "")
        ? e.message
        : "BACKUP_NETWORK"
    );
  }
}
