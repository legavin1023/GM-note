// Current originals and latest encrypted rows are never subject to retention.
const GM_ORGANIZATION_VERSION = "gm-organized-2026-11-16";
const GM_BACKUP_TIMEZONE = "Asia/Seoul";
function gmOrganizationDay(value) {
  const d = new Date(value === undefined ? Date.now() : value);
  if (!isFinite(d.getTime())) gmBackupFail("BACKUP_DATE");
  return Utilities.formatDate(d, GM_BACKUP_TIMEZONE, "yyyy-MM-dd");
}
function gmOrganizationCutoff(now) {
  // Calendar days in Korea: today, yesterday, the day before yesterday.
  return gmOrganizationDay(new Date((now || new Date()).getTime() - 2 * 86400000));
}
function gmOrganizationCategory(table, source) {
  const titles = { users:"캐릭터", scenario_npcs:"NPC", images:"갤러리", team_art_posts:"게시글", free_board_posts:"자유게시판", team_art_comments:"댓글", free_board_comments:"댓글" };
  if (titles[table]) return titles[table];
  source = String(source || "");
  if (/npc-tokens\//.test(source)) return "NPC";
  if (/tokens?\//.test(source)) return "캐릭터";
  if (/comments?\//.test(source)) return "댓글";
  if (/free-board-images\//.test(source)) return "자유게시판";
  if (/post-images\//.test(source)) return "게시글";
  return table && table.indexOf("auth.") === 0 ? "인증" : "기타";
}
function gmOrganizationIndex(ctx) {
  return gmBackupSheet(ctx.book,"최신백업색인",["기록 해시","순서","파일 ID","분류","이벤트 ID","변경일","테이블"]);
}
function gmOrganizationIndexRows(ctx) {
  const sheet=gmOrganizationIndex(ctx);
  return sheet.getLastRow()<2 ? [] : sheet.getRange(2,1,sheet.getLastRow()-1,7).getValues();
}
function gmOrganizationCategoryFolder(parent, category) { return gmBackupSubfolder(parent,category); }
function gmOrganizationCurrent(ctx, category) { return gmOrganizationCategoryFolder(gmBackupSubfolder(ctx.root,"latest"),category); }
function gmOrganizationHistory(ctx, day, category) {
  const folder=gmBackupSubfolder(ctx.records,day);
  folder.setDescription(JSON.stringify({app:"GM-note-backup-day-v1",day:day}));
  return gmOrganizationCategoryFolder(folder,category);
}
function gmOrganizationFindArchive(ctx,name) {
  const found=DriveApp.getFilesByName(name);
  while(found.hasNext()) { const f=found.next(); if(!f.isTrashed() && gmDriveInside(f,ctx.root.getId())) return f; }
  return null;
}
function gmOrganizationRecordMeta(file) {
  try {
    const meta = JSON.parse(file.getDescription());
    return meta !== null && typeof meta === "object" && !Array.isArray(meta)
      ? meta
      : {};
  } catch (_) {
    return {};
  }
}
function gmOrganizationWriteMeta(file, value) { file.setDescription(JSON.stringify(value)); }
function gmOrganizationArchive(ctx,event,archive) {
  const p=event.payload,table=p.schema+"."+p.table;
  const category=gmOrganizationCategory(p.schema==="auth"?table:p.table);
  const key=gmBackupHash([p.dataset,table,JSON.stringify(p.key)].join("/"));
  const index=gmOrganizationIndex(ctx),found=gmBackupFind(index,key,1);
  const previous=found?index.getRange(found.getRow(),1,1,7).getValues()[0]:null;
  const day=gmOrganizationDay(p.at);
  gmOrganizationWriteMeta(archive,{app:"GM-note-backup-record-v1",keyHash:key,sequence:String(event.sequence),category:category,day:day,table:table});
  if(previous && !gmBackupSequenceAtLeast(event.sequence,previous[1])) {
    archive.moveTo(gmOrganizationHistory(ctx,day,category)); return;
  }
  if(previous && previous[2]!==archive.getId()) {
    const old=DriveApp.getFileById(String(previous[2]));
    if(old.isTrashed() || !gmDriveInside(old,ctx.root.getId())) gmBackupFail("BACKUP_LATEST_MISSING");
    old.moveTo(gmOrganizationHistory(ctx,String(previous[5]),String(previous[3])));
  }
  archive.moveTo(gmOrganizationCurrent(ctx,category));
  index.getRange(found?found.getRow():index.getLastRow()+1,1,1,7).setNumberFormat("@");
  gmBackupWrite(index,found?found.getRow():index.getLastRow()+1,[key,String(event.sequence),archive.getId(),category,event.eventId,day,table]);
}
function gmOrganizationSeedLatest(ctx, limit) {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty("GM_BACKUP_SEED_COMPLETE")===GM_ORGANIZATION_VERSION)return true;
  const titles={"캐릭터":"public.users","NPC":"public.scenario_npcs","갤러리":"public.images","게시글":"public.team_art_posts","댓글":"public.team_art_comments","팀":"public.teams"};
  const sheets=ctx.book.getSheets().filter(function(s){if(s.getLastRow()<2)return false;const h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];return h[0]==="기록 키"&&h[4]==="복구 파일";}).sort(function(a,b){return a.getName().localeCompare(b.getName());});
  const cursor=JSON.parse(props.getProperty("GM_BACKUP_SEED_CURSOR")||'{"sheet":0,"row":0}');
  const covered=JSON.parse(props.getProperty("GM_BACKUP_COVERED_TABLES")||"{}");
  const index=gmOrganizationIndex(ctx);let count=0;
  while(cursor.sheet<sheets.length && count<(limit||100)) {
    const sheet=sheets[cursor.sheet],table=titles[sheet.getName()]||sheet.getName();
    if(!/^(public|storage)\.\w+$/.test(table)){cursor.sheet++;cursor.row=0;continue;}
    const category=gmOrganizationCategory(table.split(".")[1]);
    const rows=sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues();
    while(cursor.row<rows.length && count<(limit||100)) {
      const row=rows[cursor.row],match=String(row[4]).match(/\/d\/([\w-]+)/),raw=String(row[0]),slash=raw.indexOf("/");
      if(!match||slash<1||!/^\d+$/.test(String(row[1])))gmBackupFail("BACKUP_BOOTSTRAP");
      const key=gmBackupHash([raw.slice(0,slash),table,raw.slice(slash+1)].join("/"));
      const found=gmBackupFind(index,key,1);
      if(!found || !gmBackupSequenceAtLeast(index.getRange(found.getRow(),2).getDisplayValue(),String(row[1]))) {
        const file=DriveApp.getFileById(match[1]);
        if(!file||file.isTrashed()||!gmDriveInside(file,ctx.root.getId()))gmBackupFail("BACKUP_BOOTSTRAP");
        const day=gmOrganizationDay(row[3]);
        gmOrganizationWriteMeta(file,{app:"GM-note-backup-record-v1",keyHash:key,sequence:String(row[1]),category:category,day:day,table:table});
        const n=found?found.getRow():index.getLastRow()+1;index.getRange(n,1,1,7).setNumberFormat("@");
        gmBackupWrite(index,n,[key,String(row[1]),file.getId(),category,"",day,table]);
      }
      cursor.row++;count++;
    }
    if(cursor.row>=rows.length){covered[table]=true;cursor.sheet++;cursor.row=0;}
  }
  props.setProperty("GM_BACKUP_COVERED_TABLES",JSON.stringify(covered));
  props.setProperty("GM_BACKUP_SEED_CURSOR",JSON.stringify(cursor));
  if(cursor.sheet>=sheets.length){props.setProperty("GM_BACKUP_SEED_COMPLETE",GM_ORGANIZATION_VERSION);return true;}
  console.info(JSON.stringify({component:GM_ORGANIZATION_VERSION,stage:"bootstrap",processed:count}));return false;
}
function gmOrganizationMigrateLegacy(ctx,limit) {
  const latest={}; for(const row of gmOrganizationIndexRows(ctx))latest[String(row[2])]=row;
  const history=ctx.book.getSheetByName("변경이력"),events={};
  if(history && history.getLastRow()>1) for(const r of history.getRange(2,1,history.getLastRow()-1,7).getValues()) {
    const m=String(r[5]).match(/\/d\/([\w-]+)/); if(m)events[m[1]]=r;
  }
  const covered=JSON.parse(PropertiesService.getScriptProperties().getProperty("GM_BACKUP_COVERED_TABLES")||"{}");
  const files=ctx.records.getFiles();let count=0;
  while(files.hasNext() && count<limit) {
    const f=files.next();if(f.isTrashed())continue;
    const row=latest[f.getId()],h=events[f.getId()];
    if(row) f.moveTo(gmOrganizationCurrent(ctx,String(row[3])));
    else if(h && covered[String(h[2])]) {
      const category=gmOrganizationCategory(String(h[2]).split(".")[1]),day=gmOrganizationDay(h[4]);
      gmOrganizationWriteMeta(f,{app:"GM-note-backup-record-v1",legacySafeHistory:true,category:category,day:day,table:String(h[2])});
      f.moveTo(gmOrganizationHistory(ctx,day,category));
    } else {
      // Old encrypted auth events cannot be grouped without decrypting them.
      // Preserve them rather than destroying an unknown current record.
      f.moveTo(gmBackupSubfolder(gmOrganizationCurrent(ctx,h&&String(h[2]).indexOf("auth.")===0?"인증":"기타"),"기존보관"));
    }
    count++;
  }
  return count;
}
function gmOrganizationRetain(ctx,now) {
  const cutoff=gmOrganizationCutoff(now),latest={},keys={};
  for(const row of gmOrganizationIndexRows(ctx)){latest[String(row[2])]=row;keys[String(row[0])]=row;}
  let removed=0,protectedCount=0;const days=ctx.records.getFolders();
  while(days.hasNext() && removed<300) {
    const day=days.next(),name=day.getName(),marker=gmOrganizationRecordMeta(day);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(name)||name>=cutoff||marker.app!=="GM-note-backup-day-v1"||marker.day!==name)continue;
    const categories=day.getFolders();
    while(categories.hasNext() && removed<300) {
      const category=categories.next(),files=category.getFiles();
      while(files.hasNext() && removed<300) {
        const f=files.next(),m=gmOrganizationRecordMeta(f),current=latest[f.getId()];
        if(current){f.moveTo(gmOrganizationCurrent(ctx,String(current[3])));protectedCount++;continue;}
        if(m.app!=="GM-note-backup-record-v1"||m.day!==name||(!m.legacySafeHistory&&!keys[m.keyHash]))continue;
        gmBackupPrivate(f);f.setTrashed(true);removed++;
      }
      if(!category.getFiles().hasNext()&&!category.getFolders().hasNext())category.setTrashed(true);
    }
    if(!day.getFiles().hasNext()&&!day.getFolders().hasNext())day.setTrashed(true);
  }
  return {historyFilesTrashed:removed,currentFilesProtected:protectedCount,cutoff:cutoff};
}

function gmOrganizationSourceCategories(ctx) {
  const byBackup={},result={},index=ctx.book.getSheetByName("파일목록");
  if(index&&index.getLastRow()>1)for(const row of index.getRange(2,1,index.getLastRow()-1,6).getValues()){const m=String(row[2]).match(/\/d\/([\w-]+)/);if(m)byBackup[m[1]]=String(row[0]);}
  const titles={"캐릭터":"users","NPC":"scenario_npcs","갤러리":"images","게시글":"team_art_posts","댓글":"team_art_comments"};
  for(const sheet of ctx.book.getSheets()) {
    if(sheet.getLastRow()<2)continue;
    const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];if(headers[0]!=="기록 키"||headers[5]!=="백업 이미지")continue;
    const category=gmOrganizationCategory(titles[sheet.getName()]||sheet.getName().replace(/^public\./,""));
    if(category==="기타")continue;
    for(const row of sheet.getRange(2,6,sheet.getLastRow()-1,1).getValues())for(const raw of String(row[0]).match(/\/d\/[\w-]+/g)||[]){const key=byBackup[raw.slice(3)];if(key)result[key]=category;}
  }
  return result;
}
function gmOrganizationAssets(ctx,limit) {
  const files=ctx.assets.getFiles(),categories=gmOrganizationSourceCategories(ctx);let moved=0;
  while(files.hasNext()&&moved<limit) {
    const f=files.next(),meta=gmOrganizationRecordMeta(f);if(f.isTrashed()||meta.app!=="GM-note-backup"||!meta.sourceKey)continue;
    const destination=gmBackupSubfolder(ctx.assets,categories[meta.sourceKey]||gmOrganizationCategory("",meta.sourceKey));
    f.moveTo(destination);const sidecars=ctx.assets.getFilesByName(f.getName()+".manifest.json");while(sidecars.hasNext())sidecars.next().moveTo(destination);moved++;
  }
}
function gmOrganizationLiveImages(ctx,limit) {
  const id=PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");if(!id)return;
  const root=DriveApp.getFolderById(id),files=root.getFiles(),categories=gmOrganizationSourceCategories(ctx);let moved=0;
  while(files.hasNext()&&moved<limit) {
    const f=files.next(),m=gmOrganizationRecordMeta(f);if(f.isTrashed()||m.app!=="GM-note")continue;
    const suggested=categories["drive/"+f.getId()]||m.category||gmImageCategory(m.originalName);
    const category=["캐릭터","NPC","갤러리","게시글","자유게시판","댓글","기타"].indexOf(suggested)>=0?suggested:"기타";
    f.moveTo(gmImageFolder(root,category));m.category=category;gmOrganizationWriteMeta(f,m);moved++;
  }
}
function gmOrganizationPruneSheet(ctx,now) {
  if(ctx.records.getFiles().hasNext())return;
  const sheet=ctx.book.getSheetByName("변경이력");if(!sheet||sheet.getLastRow()<2)return;
  const cutoff=gmOrganizationCutoff(now),rows=sheet.getRange(2,1,sheet.getLastRow()-1,7).getValues();let removed=0;
  for(let i=rows.length-1;i>=0&&removed<300;i--){if(gmOrganizationDay(rows[i][4])<cutoff){sheet.deleteRows(i+2,1);removed++;}}
}

function maintainGoogleBackups() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty("GM_BACKUP_RETENTION_DAYS")!=="3")return;
  const lock=LockService.getUserLock();if(!lock.tryLock(20000))return;
  try {
    const ctx=gmBackupContext(false);
    if(!gmOrganizationSeedLatest(ctx,100))return;
    gmOrganizationAssets(ctx,100);
    gmOrganizationLiveImages(ctx,100);
    const moved=gmOrganizationMigrateLegacy(ctx,100);
    const result=gmOrganizationRetain(ctx,new Date());
    gmOrganizationPruneSheet(ctx,new Date());
    console.info(JSON.stringify({component:GM_ORGANIZATION_VERSION,migrated:moved,historyFilesTrashed:result.historyFilesTrashed,cutoff:result.cutoff}));
  } finally {lock.releaseLock();}
}
function setupOrganizedBackups() {
  const lock=LockService.getUserLock();if(!lock.tryLock(20000))gmBackupFail("BACKUP_LOCK");
  try {
    gmBackupContext(false);SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().setProperty("GM_BACKUP_RETENTION_DAYS","3");
    const triggers=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==="maintainGoogleBackups";});
    if(!triggers.length)ScriptApp.newTrigger("maintainGoogleBackups").timeBased().everyMinutes(10).create();
  }finally{lock.releaseLock();}
  maintainGoogleBackups();
}
