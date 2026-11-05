import {notificationPayload} from '../new-post-push/helpers.mjs';
export function discordPostPayload(post,siteUrl) {
 const push=notificationPayload(post,siteUrl);
 return {embeds:[{title:`📢 새 게시글 · ${push.body}`.slice(0,256),url:push.url,author:{name:String(post.nickname||'사용자').slice(0,256)},description:post.is_spoiler?'스포일러 게시글입니다. 사이트에서 확인하세요.':String(post.content||push.body).slice(0,3500),color:0x9f4a4a,timestamp:new Date(post.created_at).toISOString(),footer:{text:'DragonAge 팀 작품 게시판'}}],allowed_mentions:{parse:[]}};
}
