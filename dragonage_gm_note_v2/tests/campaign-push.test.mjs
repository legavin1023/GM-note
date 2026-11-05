import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignPayload,sessionStillDue} from '../supabase/functions/campaign-push/payloads.mjs';
import {pushLoginDestination} from '../src/services/pushRoutes.mjs';
const site='https://legavin1023.github.io/GM-note/';

test('activity push identifies the target and changed values',()=>{
 const payload=campaignPayload({kind:'activity',id:'e'}, {
  actor_label:'마스터',feature:'팀 정보',operation:'UPDATE',entity_label:'그리핀',
  details:[{label:'진행 시나리오',before:'1',after:'5'}],
 },null,site);
 assert.match(payload.body,/그리핀/);
 assert.match(payload.body,/진행 시나리오: 1 → 5/);
});
test('notification destinations survive login without allowing foreign redirects',()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 assert.deepEqual(pushLoginDestination(`/notices/${id}`),{path:`/notices/${id}`});
 assert.deepEqual(pushLoginDestination(`/teams/${id}`),{path:`/teams/${id}`});
 assert.deepEqual(pushLoginDestination('/activity'),{path:'/activity'});
 for(const value of ['//evil.example','https://evil.example','/notices/new','/teams/no-id','/board/free?postId=no-id'])assert.equal(pushLoginDestination(value),null);
});
test('notice, session and master activity use real router paths and Korean time',()=>{
 assert.equal(new URL(campaignPayload({kind:'notice',id:'e'},{id:'n',title:'공지'},null,site).url).hash,'#/notices/n');
 const session=campaignPayload({kind:'session',id:'e'},{id:'s',team_id:'t',title:'3회차',starts_at:'2026-10-07T11:00:00Z'},{name:'첫 팀'},site);
 assert.equal(new URL(session.url).hash,'#/teams/t');assert.match(session.body,/20:00/);
 assert.equal(new URL(campaignPayload({kind:'activity',id:'e'},{actor_label:'플레이어',feature:'메모',operation:'UPDATE'},null,site).url).hash,'#/activity');
 assert.throws(()=>campaignPayload({kind:'notice'},{},null,'https://example.com/#/bad'));
});
test('cancelled, rescheduled, past and not-yet-due sessions do not send',()=>{
 const now=Date.parse('2026-10-07T10:50:00Z'),starts='2026-10-07T11:00:00Z';
 const event={session_starts_at:starts},session={starts_at:starts,cancelled:false};
 assert.equal(sessionStillDue(event,session,now),true);
 assert.equal(sessionStillDue(event,{...session,cancelled:true},now),false);
 assert.equal(sessionStillDue(event,{...session,starts_at:'2026-10-07T12:00:00Z'},now),false);
 assert.equal(sessionStillDue(event,session,Date.parse(starts)),false);
 assert.equal(sessionStillDue(event,session,now-1),false);
});
