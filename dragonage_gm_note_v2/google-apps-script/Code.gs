// Paste this entire file into the existing Apps Script project's Code.gs.
// Real secrets belong ONLY in Script Properties, never in this file.
const GM_DRIVE_VERSION = "gm-drive-2026-11-11";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}
function doGet() {
  // Public deployment fingerprint only. Never includes settings or secrets.
  return jsonResponse({
    ok: true,
    version: GM_DRIVE_VERSION,
    backupReady: typeof gmBackupHandle === "function",
    deploymentCheck: "backup-router-check-1",
    organizationVersion: typeof GM_ORGANIZATION_VERSION === "undefined" ? null : GM_ORGANIZATION_VERSION,
  });
}
function gasFail(code) {
  const err = new Error(code);
  err.safeCode = code;
  throw err;
}
function bytesDigest(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (b) {
      return ("0" + (b & 255).toString(16)).slice(-2);
    })
    .join("");
}
function fileResult(file) {
  const id = file.getId();
  return {
    ok: true,
    version: GM_DRIVE_VERSION,
    id: id,
    url:
      "https://drive.google.com/thumbnail?id=" +
      encodeURIComponent(id) +
      "&sz=w1600",
    fileUrl: file.getUrl(),
  };
}
function imageSignature(bytes, mime) {
  const b = bytes.slice(0, 16).map(function (v) {
    return v & 255;
  });
  const starts = function (a) {
    return a.every(function (v, i) {
      return b[i] === v;
    });
  };
  if (mime === "image/jpeg") return starts([255, 216, 255]);
  if (mime === "image/png") return starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (mime === "image/gif")
    return (
      starts([71, 73, 70, 56]) && [55, 57].indexOf(b[4]) >= 0 && b[5] === 97
    );
  return starts([82, 73, 70, 70]) && b.slice(8, 12).join(",") === "87,69,66,80";
}

function gmDriveInside(file, rootId) {
  const pending=[file];const visited={};let steps=0;
  while(pending.length && steps++<100){const item=pending.pop(),id=item.getId();if(id===rootId)return true;if(visited[id])continue;visited[id]=true;const parents=item.getParents();while(parents.hasNext())pending.push(parents.next());}
  return false;
}
function gmImageCategory(name) {
  const match=String(name||"").match(/^gmcat_(token|npc|gallery|posts|comments)__/);
  return match?({token:"캐릭터",npc:"NPC",gallery:"갤러리",posts:"게시글",comments:"댓글"}[match[1]]):"기타";
}
function gmImageFolder(root, name) {
  const found=root.getFoldersByName(name);return found.hasNext()?found.next():root.createFolder(name);
}

function doPost(e) {
  let stage = "parse",
    requestId = "unknown",
    lock = null;
  try {
    if (
      !e ||
      !e.postData ||
      e.postData.contents.length > Math.ceil(MAX_BYTES / 3) * 4 + 8192
    )
      gasFail("GAS_VALIDATION");
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (_) {
      gasFail("GAS_VALIDATION");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      gasFail("GAS_VALIDATION");
    // Backup uses a separate secret and private folders; image uploads stay unchanged.
    if (
      typeof body.action === "string" &&
      body.action.indexOf("backup") === 0
    ) {
      return gmBackupHandle(body);
    }
    if (/^[\w-]{16,100}$/.test(body.requestId || ""))
      requestId = body.requestId;
    stage = "config";
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty("SHARED_SECRET");
    const folderId = props.getProperty("DRIVE_FOLDER_ID");
    if (!secret || !folderId) gasFail("GAS_CONFIG");
    stage = "auth";
    if (typeof body.secret !== "string" || body.secret !== secret)
      gasFail("GAS_AUTH");
    if (!/^[\w-]{10,100}$/.test(body.userId || "")) gasFail("GAS_VALIDATION");
    stage = "folder";
    const folder = DriveApp.getFolderById(folderId);
    folder.getName();
    if (body.action === "diagnose") {
      if (body.isGM !== true) gasFail("GAS_FORBIDDEN");
      return jsonResponse({
        ok: true,
        version: GM_DRIVE_VERSION,
        requestId: requestId,
        folderAccessible: true,
      });
    }
    if (body.action === "delete" || body.action === "inspect") {
      if (!/^[\w-]{10,200}$/.test(body.id || "")) gasFail("GAS_VALIDATION");
      stage = "delete";
      const file = DriveApp.getFileById(body.id);
      const inFolder = gmDriveInside(file, folderId);
      let meta;
      try {
        meta = JSON.parse(file.getDescription());
      } catch (_) {
        gasFail("GAS_FORBIDDEN");
      }
      if (
        !inFolder ||
        meta.app !== "GM-note" ||
        (body.isGM !== true && meta.userId !== body.userId)
      )
        gasFail("GAS_FORBIDDEN");
      if (body.action === "inspect") {
        const bytes = file.getBlob().getBytes();
        return jsonResponse({
          ok: true,
          version: GM_DRIVE_VERSION,
          requestId: requestId,
          sha256: bytesDigest(bytes),
          bytes: bytes.length,
          trashed: file.isTrashed(),
        });
      }
      // Edge already checked all public DB references; use trash for recovery.
      file.setTrashed(true);
      return jsonResponse({
        ok: true,
        version: GM_DRIVE_VERSION,
        requestId: requestId,
        trashed: true,
      });
    }
    stage = "validation";
    if (
      body.action !== "upload" ||
      ALLOWED_TYPES.indexOf(body.mimeType) < 0 ||
      !/^[\w-]{16,100}$/.test(body.operationId || "")
    )
      gasFail("GAS_VALIDATION");
    const base64 = body.base64;
    if (
      typeof base64 !== "string" ||
      !base64.length ||
      base64.length % 4 ||
      base64.length > Math.ceil(MAX_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
    )
      gasFail("GAS_VALIDATION");
    const bytes = Utilities.base64Decode(base64);
    if (
      !bytes.length ||
      bytes.length > MAX_BYTES ||
      !imageSignature(bytes, body.mimeType)
    )
      gasFail("GAS_VALIDATION");
    const sha256 = bytesDigest(bytes);
    // Stable operation identity makes a retry safe after a lost HTTP response.
    const name = "gm_" + body.userId + "_" + body.operationId;
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) gasFail("GAS_CREATE");
    stage = "create";
    const category = gmImageCategory(body.name);
    const destination = gmImageFolder(folder, category);
    const candidates = DriveApp.getFilesByName(name);
    const owned = [];
    while(candidates.hasNext()){const candidate=candidates.next();if(!candidate.isTrashed() && gmDriveInside(candidate,folderId))owned.push(candidate);}
    const matches = {hasNext:function(){return owned.length>0;},next:function(){return owned.shift();}};
    let file;
    if (matches.hasNext()) {
      file = matches.next();
      let meta;
      try {
        meta = JSON.parse(file.getDescription());
      } catch (_) {
        gasFail("GAS_CREATE");
      }
      if (
        meta.app !== "GM-note" ||
        meta.userId !== body.userId ||
        meta.sha256 !== sha256 ||
        meta.mimeType !== body.mimeType
      )
        gasFail("GAS_VALIDATION");
    } else {
      file = destination.createFile(Utilities.newBlob(bytes, body.mimeType, name));
      file.setDescription(
        JSON.stringify({
          app: "GM-note",
          userId: body.userId,
          originalName: String(body.name || "image").replace(/^gmcat_[a-z]+__/, "").slice(0, 100),
          category: category,
          sha256: sha256,
          mimeType: body.mimeType,
          operationId: body.operationId,
        })
      );
    }
    file.moveTo(destination);
    stage = "share";
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const result = fileResult(file);
    result.sha256 = sha256;
    result.requestId = requestId;
    console.info(
      JSON.stringify({
        requestId: requestId,
        stage: "complete",
        version: GM_DRIVE_VERSION,
      })
    );
    return jsonResponse(result);
  } catch (error) {
    const codes = {
      folder: "GAS_FOLDER",
      create: "GAS_CREATE",
      share: "GAS_SHARE",
      delete: "GAS_DELETE",
      validation: "GAS_VALIDATION",
    };
    const code = error.safeCode || codes[stage] || "GAS_INTERNAL";
    // Never log event/body, secret, folder ID, image bytes, or raw exceptions.
    console.error(
      JSON.stringify({
        requestId: requestId,
        stage: stage,
        code: code,
        version: GM_DRIVE_VERSION,
      })
    );
    return jsonResponse({
      ok: false,
      version: GM_DRIVE_VERSION,
      requestId: requestId,
      code: code,
      error: code,
    });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
function authorizeDrive() {
  const folderId =
    PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
  if (!folderId) throw new Error("GAS_CONFIG");
  DriveApp.getFolderById(folderId).getName();
  console.info("Drive folder access OK");
}
