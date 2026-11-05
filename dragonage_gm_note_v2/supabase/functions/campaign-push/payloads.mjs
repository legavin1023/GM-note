export function campaignPayload(event, record, team, siteUrl) {
 const base=new URL(siteUrl);
 if(base.protocol!=='https:' || base.search || base.hash || !base.pathname.endsWith('/')) throw new Error('Invalid site URL');
 let title,body;
 if(event.kind==='notice') { title='📢 새 공지가 올라왔어요'; body=record.title; base.hash=`/notices/${encodeURIComponent(record.id)}`; }
 else if(event.kind==='session') {
  title='⏰ 세션 시작 10분 전이에요';
  const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:false}).format(new Date(record.starts_at));
  body=`${team?.name || '팀'} · ${record.title} · ${time} (한국 시간)`;
  base.hash=`/teams/${encodeURIComponent(record.team_id)}`;
 } else { title='📋 새 최근활동이 있어요'; body=`${record.actor_label} · ${record.feature} ${ {INSERT:'등록',UPDATE:'수정',DELETE:'삭제'}[record.operation] || '변경'}${record.entity_label ? ' · '+record.entity_label:''}`; const details=Array.isArray(record.details)?record.details:[];
  const summary=details.slice(0,2).filter(d=>d && typeof d.label==='string').map(d=>
    record.operation==='UPDATE' ? `${d.label}: ${d.before ?? '없음'} → ${d.after ?? '없음'}` :
    `${d.label}: ${(record.operation==='DELETE'?d.before:d.after) ?? '없음'}`).join(' · ');
  if(summary) body+=' · '+summary;
  base.hash='/activity'; }
 return {kind:event.kind,eventId:event.id,title,body:String(body||'').slice(0,240),url:base.href};
}
export function sessionStillDue(event,session,now=Date.now()) {
 const starts=Date.parse(session.starts_at);
 return !session.cancelled && starts===Date.parse(event.session_starts_at) && starts>now && starts<=now+10*60*1000;
}
