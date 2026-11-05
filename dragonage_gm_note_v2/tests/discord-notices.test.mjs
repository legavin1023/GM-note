import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discordNoticePayload} from '../supabase/functions/discord-notices/payload.mjs';
test('notice uses actual title/detail route, bounded Discord fields and no mentions',()=>{
 const notice={id:'123',title:'가'.repeat(500),content:'@everyone '+ '나'.repeat(5000),created_at:'2026-10-06T12:00:00Z'};
 const payload=discordNoticePayload(notice,'https://legavin1023.github.io/GM-note/');
 assert.equal(payload.embeds[0].title.length,256);assert.equal(payload.embeds[0].description.length,3500);
 assert.equal(new URL(payload.embeds[0].url).hash,'#/notices/123');assert.deepEqual(payload.allowed_mentions.parse,[]);
 assert.throws(()=>discordNoticePayload(notice,'https://example.com/#/bad'));
});
