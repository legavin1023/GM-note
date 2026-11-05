export function discordNoticePayload(notice, siteUrl) {
 const base=new URL(siteUrl);
 if(base.protocol!=='https:'||base.search||base.hash||!base.pathname.endsWith('/'))throw new Error('Invalid app URL');
 base.hash=`/notices/${encodeURIComponent(notice.id)}`;
 return {embeds:[{title:`📢 전체공지 · ${String(notice.title||'새 공지')}`.slice(0,256),url:base.href,description:String(notice.content||'새 공지가 등록되었습니다.').slice(0,3500),color:0x9f4a4a,timestamp:new Date(notice.created_at).toISOString(),footer:{text:'DragonAge 전체공지'}}],allowed_mentions:{parse:[]}};
}
