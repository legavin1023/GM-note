import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discordPostPayload} from '../supabase/functions/discord-posts/payload.mjs';
test('board Discord uses actual post route and masks spoilers',()=>{
 const post={id:'p',nickname:'작성자',content:'비밀 내용',created_at:'2026-10-06T12:00:00Z',is_spoiler:true};
 const body=discordPostPayload(post,'https://legavin1023.github.io/GM-note/');
 assert.equal(new URL(body.embeds[0].url).hash,'#/board/free?postId=p');
 assert.ok(!JSON.stringify(body).includes('비밀 내용'));assert.deepEqual(body.allowed_mentions.parse,[]);
 const normal=discordPostPayload({...post,is_spoiler:false,content:'가'.repeat(5000)},'https://legavin1023.github.io/GM-note/');
 assert.ok(normal.embeds[0].title.length<=256);assert.equal(normal.embeds[0].description.length,3500);
});
