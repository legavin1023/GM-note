// Add this as Backup.gs in the SAME Apps Script project, or use the combined paste file.
const GM_BACKUP_VERSION = "gm-backup-2026-11-11";
function gmBackupFail(code) {
  const e = new Error(code);
  e.safeCode = code;
  throw e;
}
function gmBackupHash(text) {
  return bytesDigest(Utilities.newBlob(text).getBytes());
}
function gmBackupPrivate(file) {
  if (file.getSharingAccess() !== DriveApp.Access.PRIVATE)
    gmBackupFail("BACKUP_PRIVATE");
}
function gmBackupSubfolder(parent, name) {
  const found = parent.getFoldersByName(name);
  const folder = found.hasNext() ? found.next() : parent.createFolder(name);
  gmBackupPrivate(folder);
  return folder;
}
function gmBackupContext(create) {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty("BACKUP_FOLDER_ID");
  if (!folderId && create) {
    const folder = DriveApp.createFolder("GM-note 비공개 백업");
    folderId = folder.getId();
    props.setProperty("BACKUP_FOLDER_ID", folderId);
  }
  if (!folderId || folderId === props.getProperty("DRIVE_FOLDER_ID"))
    gmBackupFail("BACKUP_CONFIG");
  const root = DriveApp.getFolderById(folderId);
  gmBackupPrivate(root);
  let sheetId = props.getProperty("BACKUP_SPREADSHEET_ID");
  if (!sheetId && create) {
    const book = SpreadsheetApp.create("GM-note 자동 백업");
    sheetId = book.getId();
    DriveApp.getFileById(sheetId).moveTo(root);
    props.setProperty("BACKUP_SPREADSHEET_ID", sheetId);
    const info = book.getSheets()[0];
    info.setName("안내");
    info.getRange(1, 1, 5, 2).setValues([
      ["항목", "내용"],
      [
        "백업 방향",
        "GM-note DB에서 자동 반영. 시트 수정은 사이트에 반영되지 않습니다.",
      ],
      [
        "복구 원본",
        "records의 암호화 JSON과 assets 원본 파일, snapshots의 전체 DB 백업",
      ],
      [
        "삭제 기록",
        "삭제된 행도 상태와 이전 내용, 복구 파일 링크를 유지합니다.",
      ],
      [
        "복호화 키",
        "별도 보관한 복구 키가 필요합니다. 시트나 백업 폴더에는 저장하지 않습니다.",
      ],
    ]);
    info.setFrozenRows(1);
    info
      .getRange(1, 1, 1, 2)
      .setBackground("#263445")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    info.setColumnWidth(1, 150);
    info.setColumnWidth(2, 660);
    info.getRange(1, 1, 5, 2).setWrap(true);
  }
  if (!sheetId) gmBackupFail("BACKUP_CONFIG");
  gmBackupPrivate(DriveApp.getFileById(sheetId));
  return {
    root: root,
    book: SpreadsheetApp.openById(sheetId),
    records: gmBackupSubfolder(root, "records"),
    assets: gmBackupSubfolder(root, "assets"),
    snapshots: gmBackupSubfolder(root, "snapshots"),
  };
}
function setupGoogleBackup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("BACKUP_SHARED_SECRET")) gmBackupFail("BACKUP_CONFIG");
  const lock = LockService.getUserLock();
  if (!lock.tryLock(20000)) gmBackupFail("BACKUP_LOCK");
  try {
    const ctx = gmBackupContext(true);
    console.info(
      JSON.stringify({
        spreadsheetUrl: ctx.book.getUrl(),
        folderUrl: ctx.root.getUrl(),
        backupVersion: GM_BACKUP_VERSION,
      })
    );
  } finally {
    lock.releaseLock();
  }
}
function gmBackupText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  let text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length > 40000)
    text = text.slice(0, 39940) + " … [원문은 복구 파일에 보관]";
  // User text must never execute as a spreadsheet formula.
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}
function gmBackupSheet(book, name, headers) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet
      .getRange(1, 1, 1, headers.length)
      .setBackground("#263445")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheet.setColumnWidths(1, headers.length, 180);
  }
  return sheet;
}
function gmBackupFind(sheet, value, column) {
  if (sheet.getLastRow() < 2) return null;
  return sheet
    .getRange(2, column, sheet.getLastRow() - 1, 1)
    .createTextFinder(value)
    .matchEntireCell(true)
    .useRegularExpression(false)
    .findNext();
}
function gmBackupWrite(sheet, row, values) {
  if (row > sheet.getMaxRows())
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      Math.max(100, row - sheet.getMaxRows())
    );
  if (values.length > sheet.getMaxColumns())
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      values.length - sheet.getMaxColumns()
    );
  const range = sheet.getRange(row, 1, 1, values.length);
  range
    .setValues([values.map(gmBackupText)])
    .setWrap(true)
    .setVerticalAlignment("top");
}
function gmBackupSequenceAtLeast(a, b) {
  a = String(a).replace(/^0+/, "") || "0";
  b = String(b).replace(/^0+/, "") || "0";
  return a.length > b.length || (a.length === b.length && a >= b);
}
function gmBackupProjection(ctx, event, archiveUrl, assetUrls) {
  const p = event.payload;
  // Login credentials are preserved only in encrypted records, never Sheets.
  if (p.schema === "auth") return;
  const titles = {
    users: "캐릭터",
    team_art_posts: "게시글",
    team_art_comments: "댓글",
    images: "갤러리",
    teams: "팀",
    scenario_npcs: "NPC",
  };
  const name =
    (p.schema === "public" && titles[p.table]) || p.schema + "." + p.table;
  const fixed = [
    "기록 키",
    "변경 순서",
    "상태",
    "반영 시각",
    "복구 파일",
    "백업 이미지",
  ];
  const sheet = gmBackupSheet(ctx.book, name.slice(0, 90), fixed);
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = p.after || p.before || {};
  const fields = Object.keys(rowData).sort();
  for (const field of fields)
    if (headers.indexOf(field) < 0) headers.push(field);
  if (headers.length > sheet.getMaxColumns())
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setBackground("#263445")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  const key = p.dataset + "/" + JSON.stringify(p.key);
  const found = gmBackupFind(sheet, key, 1),
    row = found ? found.getRow() : sheet.getLastRow() + 1;
  if (p.oldKey && JSON.stringify(p.oldKey) !== JSON.stringify(p.key)) {
    const prior = gmBackupFind(
      sheet,
      p.dataset + "/" + JSON.stringify(p.oldKey),
      1
    );
    if (
      prior &&
      gmBackupSequenceAtLeast(
        event.sequence,
        sheet.getRange(prior.getRow(), 2).getDisplayValue()
      )
    ) {
      sheet
        .getRange(prior.getRow(), 2, 1, 2)
        .setValues([[event.sequence, "키 변경"]]);
    }
  }
  if (found) {
    const previous = sheet.getRange(row, 2).getDisplayValue();
    if (!gmBackupSequenceAtLeast(event.sequence, previous)) return;
  }
  const values = [
    key,
    event.sequence,
    p.op === "DELETE" ? "삭제" : "현재",
    p.at,
    archiveUrl,
    assetUrls.join("\n"),
  ];
  for (const field of headers.slice(fixed.length)) values.push(rowData[field]);
  sheet.getRange(row, 1, 1, 2).setNumberFormat("@");
  gmBackupWrite(sheet, row, values);
  sheet
    .getRange(row, 1, 1, headers.length)
    .setBackground(p.op === "DELETE" ? "#fce8e6" : "#ffffff");
}
function gmBackupAsset(ctx, asset, origin, category) {
  const store = typeof gmOrganizationCategory === "function" ? gmBackupSubfolder(ctx.assets, category || gmOrganizationCategory("", asset.key)) : ctx.assets;
  const name =
    "asset_" + gmBackupHash(asset.key + "/" + (asset.revision || ""));
  const all = DriveApp.getFilesByName(name);
  const owned = [];
  while(all.hasNext()){const f=all.next();if(!f.isTrashed() && gmDriveInside(f,ctx.assets.getId()))owned.push(f);}
  const matches = {hasNext:function(){return owned.length>0;},next:function(){return owned.shift();}};
  if (matches.hasNext()) {
    const existing = matches.next();
    existing.moveTo(store);
    gmBackupPrivate(existing);
    return gmBackupRegisterAsset(ctx, asset, existing);
  }
  // Plain row references can reuse the latest versioned original backup.
  // A known Storage revision must still match that exact revision.
  if (asset.type !== "drive" && (!asset.revision || !asset.downloadUrl)) {
    const index = ctx.book.getSheetByName("파일목록");
    const keys =
      asset.type === "legacy"
        ? [
            "storage/free-board-images/" + asset.path,
            "storage/post-images/" + asset.path,
          ]
        : [asset.key];
    if (index && index.getLastRow() > 1) {
      const rows = index.getRange(2, 1, index.getLastRow() - 1, 6).getValues();
      for (let i = rows.length - 1; i >= 0; i--)
        if (
          keys.indexOf(rows[i][0]) >= 0 &&
          (!asset.revision || rows[i][1] === asset.revision)
        ) {
          const id = String(rows[i][2]).match(/\/d\/([\w-]+)/);
          if (id) {
            const stored = DriveApp.getFileById(id[1]);
            if (stored.isTrashed()) continue;
            const parents = stored.getParents();
            let inside = false;
            while (parents.hasNext())
              if (parents.next().getId() === ctx.assets.getId()) inside = true;
            if (!inside && typeof gmDriveInside === "function") inside = gmDriveInside(stored,ctx.assets.getId());
            if (!inside) continue;
            gmBackupPrivate(stored);
            return { key: asset.key, id: stored.getId(), url: stored.getUrl() };
          }
        }
    }
  }
  let blob;
  if (asset.type === "drive") {
    if (!/^[\w-]{10,200}$/.test(asset.id || "")) gmBackupFail("BACKUP_FORMAT");
    blob = DriveApp.getFileById(asset.id).getBlob();
  } else {
    const url = asset.downloadUrl;
    if (
      typeof origin !== "string" ||
      !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(origin) ||
      typeof url !== "string" ||
      url.indexOf(origin + "/storage/v1/object/sign/") !== 0
    )
      gmBackupFail("BACKUP_ASSET_MISSING");
    const response = UrlFetchApp.fetch(url, {
      followRedirects: false,
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200)
      gmBackupFail("BACKUP_ASSET_MISSING");
    blob = response.getBlob();
  }
  const bytes = blob.getBytes(),
    sha = bytesDigest(bytes);
  const file = store.createFile(blob.setName(name));
  gmBackupPrivate(file);
  file.setDescription(
    JSON.stringify({
      app: "GM-note-backup",
      sourceKey: asset.key,
      revision: asset.revision || null,
      sha256: sha,
      bytes: bytes.length,
    })
  );
  return gmBackupRegisterAsset(ctx, asset, file);
}
function gmBackupRegisterAsset(ctx, asset, file) {
  let meta;
  try {
    meta = JSON.parse(file.getDescription());
  } catch (_) {
    meta = null;
  }
  if (!meta || !meta.sha256) {
    const b = file.getBlob().getBytes();
    meta = {
      app: "GM-note-backup",
      sourceKey: asset.key,
      revision: asset.revision || null,
      sha256: bytesDigest(b),
      bytes: b.length,
    };
    file.setDescription(JSON.stringify(meta));
  }
  // Drive descriptions are lost in ZIP downloads, so keep a portable manifest too.
  const manifestName = file.getName() + ".manifest.json";
  const parents = file.getParents();
  const store = parents.hasNext() ? parents.next() : ctx.assets;
  const oldManifests = ctx.assets.getFilesByName(manifestName);
  while(oldManifests.hasNext())oldManifests.next().moveTo(store);
  if (!store.getFilesByName(manifestName).hasNext()) {
    const manifest = {
      format: "gm-note-asset-v1",
      sourceKey: asset.key,
      revision: asset.revision || null,
      fileName: file.getName(),
      driveFileId: file.getId(),
      sha256: meta.sha256,
      bytes: meta.bytes,
      mimeType: file.getMimeType(),
    };
    const saved = store.createFile(
      manifestName,
      JSON.stringify(manifest),
      MimeType.PLAIN_TEXT
    );
    gmBackupPrivate(saved);
  }
  const sheet = gmBackupSheet(ctx.book, "파일목록", [
    "원본 경로",
    "원본 버전",
    "백업 파일",
    "SHA-256",
    "크기",
    "저장 시각",
  ]);
  if (!gmBackupFind(sheet, file.getUrl(), 3))
    gmBackupWrite(sheet, sheet.getLastRow() + 1, [
      asset.key,
      asset.revision || "",
      file.getUrl(),
      meta.sha256,
      meta.bytes,
      new Date().toISOString(),
    ]);
  return {
    key: asset.key,
    id: file.getId(),
    url: file.getUrl(),
    sha256: meta.sha256,
    bytes: meta.bytes,
  };
}
function gmBackupEvent(ctx, body) {
  const event = body.event,
    p = event && event.payload;
  if (
    !event ||
    !p ||
    !/^[\w-]{36}$/.test(event.eventId || "") ||
    !/^\d+$/.test(event.sequence || "") ||
    !/^[\w-]{36}$/.test(p.dataset || "") ||
    !["public", "storage", "auth"].includes(p.schema) ||
    !/^\w{1,80}$/.test(p.table || "") ||
    !body.encrypted ||
    body.encrypted.eventId !== event.eventId ||
    body.encrypted.format !== "gm-note-event-v1"
  )
    gmBackupFail("BACKUP_FORMAT");
  const name = p.dataset + "_" + event.eventId + ".json";
  const existingArchive = typeof gmOrganizationFindArchive === "function" ? gmOrganizationFindArchive(ctx,name) : null;
  const found = existingArchive ? {hasNext:function(){return true;},next:function(){return existingArchive;}} : ctx.records.getFilesByName(name);
  const archive = found.hasNext()
    ? found.next()
    : ctx.records.createFile(
        name,
        JSON.stringify(body.encrypted),
        MimeType.PLAIN_TEXT
      );
  gmBackupPrivate(archive);
  const assets = [];
  for (const asset of body.assets || [])
    assets.push(gmBackupAsset(ctx, asset, body.storageOrigin, typeof gmOrganizationCategory === "function" ? gmOrganizationCategory(p.table,asset.key) : null));
  gmBackupProjection(
    ctx,
    event,
    archive.getUrl(),
    assets.map((a) => a.url)
  );
  const history = gmBackupSheet(ctx.book, "변경이력", [
    "이벤트 ID",
    "순서",
    "테이블",
    "작업",
    "변경 시각",
    "복구 파일",
    "백업 이미지",
  ]);
  if (!gmBackupFind(history, event.eventId, 1))
    gmBackupWrite(history, history.getLastRow() + 1, [
      event.eventId,
      event.sequence,
      p.schema + "." + p.table,
      p.op,
      p.at,
      archive.getUrl(),
      assets.map((a) => a.url).join("\n"),
    ]);
  if(typeof gmOrganizationArchive === "function")gmOrganizationArchive(ctx,event,archive);
  SpreadsheetApp.flush();
  return { eventId: event.eventId, archived: true, assetCount: assets.length };
}
function gmBackupPart(ctx, body) {
  if (
    !/^[\w-]{16,100}$/.test(body.snapshotId || "") ||
    !Number.isInteger(body.part) ||
    body.part < 0 ||
    body.part > 100000 ||
    typeof body.base64 !== "string" ||
    body.base64.length > 6000000 ||
    !body.base64.length ||
    body.base64.length % 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)
  )
    gmBackupFail("BACKUP_FORMAT");
  const bytes = Utilities.base64Decode(body.base64);
  if (bytesDigest(bytes) !== body.sha256) gmBackupFail("BACKUP_CHECKSUM");
  const name =
    body.snapshotId + ".part-" + ("000000" + body.part).slice(-6) + ".enc";
  const found = ctx.snapshots.getFilesByName(name);
  const file = found.hasNext()
    ? found.next()
    : ctx.snapshots.createFile(
        Utilities.newBlob(bytes, "application/octet-stream", name)
      );
  gmBackupPrivate(file);
  if (bytesDigest(file.getBlob().getBytes()) !== body.sha256)
    gmBackupFail("BACKUP_CHECKSUM");
  return {
    id: file.getId(),
    part: body.part,
    sha256: body.sha256,
    bytes: bytes.length,
  };
}
function gmBackupComplete(ctx, body) {
  const manifest = body.manifest;
  if (
    !manifest ||
    manifest.format !== "gm-note-snapshot-v1" ||
    !/^[\w-]{16,100}$/.test(manifest.snapshotId || "") ||
    !Array.isArray(manifest.parts) ||
    !manifest.parts.length ||
    manifest.parts.length > 10000
  )
    gmBackupFail("BACKUP_FORMAT");
  let total = 0;
  for (let i = 0; i < manifest.parts.length; i++) {
    const p = manifest.parts[i];
    if (p.part !== i || !/^\w[\w-]{9,199}$/.test(p.id || ""))
      gmBackupFail("BACKUP_FORMAT");
    const f = DriveApp.getFileById(p.id);
    gmBackupPrivate(f);
    const parents = f.getParents();
    let inside = false;
    while (parents.hasNext())
      if (parents.next().getId() === ctx.snapshots.getId()) inside = true;
    if (
      !inside ||
      f.getName() !==
        manifest.snapshotId + ".part-" + ("000000" + i).slice(-6) + ".enc"
    )
      gmBackupFail("BACKUP_FORMAT");
    const b = f.getBlob().getBytes();
    if (b.length !== p.bytes || bytesDigest(b) !== p.sha256)
      gmBackupFail("BACKUP_CHECKSUM");
    total += b.length;
  }
  if (total !== manifest.bytes) gmBackupFail("BACKUP_CHECKSUM");
  const name = manifest.snapshotId + ".manifest.json",
    found = ctx.snapshots.getFilesByName(name);
  const file = found.hasNext()
    ? found.next()
    : ctx.snapshots.createFile(
        name,
        JSON.stringify(manifest),
        MimeType.PLAIN_TEXT
      );
  gmBackupPrivate(file);
  return {
    snapshotId: manifest.snapshotId,
    manifestUrl: file.getUrl(),
    verifiedParts: manifest.parts.length,
  };
}
function gmBackupHandle(body) {
  let lock;
  try {
    const secret = PropertiesService.getScriptProperties().getProperty(
      "BACKUP_SHARED_SECRET"
    );
    if (!secret) gmBackupFail("BACKUP_CONFIG");
    if (typeof body.secret !== "string" || body.secret !== secret)
      gmBackupFail("BACKUP_AUTH");
    lock = LockService.getUserLock();
    if (!lock.tryLock(20000)) gmBackupFail("BACKUP_LOCK");
    const ctx = gmBackupContext(false);
    let result;
    if (body.action === "backupEvent") result = gmBackupEvent(ctx, body);
    else if (body.action === "backupPart") result = gmBackupPart(ctx, body);
    else if (body.action === "backupComplete")
      result = gmBackupComplete(ctx, body);
    else if (body.action === "backupStatus")
      result = {
        spreadsheetUrl: ctx.book.getUrl(),
        folderUrl: ctx.root.getUrl(),
      };
    else gmBackupFail("BACKUP_FORMAT");
    return jsonResponse(
      Object.assign(
        {
          ok: true,
          version: GM_DRIVE_VERSION,
          backupVersion: GM_BACKUP_VERSION,
        },
        result
      )
    );
  } catch (e) {
    const code = e.safeCode || "BACKUP_WRITE";
    console.error(
      JSON.stringify({
        component: "google-backup",
        requestId: /^[\w-]{16,100}$/.test(body.requestId || "")
          ? body.requestId
          : "unknown",
        code: code,
      })
    );
    return jsonResponse({
      ok: false,
      version: GM_DRIVE_VERSION,
      backupVersion: GM_BACKUP_VERSION,
      code: code,
      error: code,
    });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
