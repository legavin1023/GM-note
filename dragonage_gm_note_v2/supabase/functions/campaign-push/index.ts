import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import webpush from 'npm:web-push@3.6.7';
import {deliverSubscriptions} from '../new-post-push/helpers.mjs';
import {campaignPayload,sessionStillDue} from './payloads.mjs';
const required=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error('Missing server setting');return value;};
Deno.serve(async(request)=>{
 if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([digest(request.headers.get('x-push-webhook-secret')||''),digest(required('PUSH_WEBHOOK_SECRET'))]);
 if(a.reduce((d,v,i)=>d|(v^b[i]),0))return Response.json({error:'Unauthorized'},{status:401});
 try {
  const body=await request.json().catch(()=>null);
  if(body?.action!=='drain')return Response.json({error:'Invalid action'},{status:400});
  const admin=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const checked=async(op:any)=>{const r=await op;if(r.error)throw r.error;return r.data;};
  const events=await checked(admin.from('campaign_push_events').select('*').is('completed_at',null).gt('expires_at',new Date().toISOString()).order('created_at').limit(10));
  const started=Date.now(),totals={sent:0,expired:0,failed:0,skipped:0};
  for(const event of events||[]) {
   if(Date.now()-started>75000)break;
   if(!await checked(admin.rpc('claim_campaign_event',{p_event_id:event.id})))continue;
   const table={notice:'notices',session:'team_sessions',activity:'app_activity_logs'}[event.kind as string];
   if(!table)continue;
   const record=await checked(admin.from(table).select('*').eq('id',event.source_id).maybeSingle());
   if(!record || (event.kind==='session'&&!sessionStillDue(event,record))) {await checked(admin.from('campaign_push_events').update({completed_at:new Date().toISOString()}).eq('id',event.id));continue;}
   const team=record.team_id?await checked(admin.from('teams').select('name').eq('id',record.team_id).maybeSingle()):null;
   const payload=JSON.stringify(campaignPayload(event,record,team,required('PUSH_SITE_URL')));
   let cursor=null,failed=false,finished=true;
   while(true){
    if(Date.now()-started>85000){finished=false;break;}
    if(event.kind==='session') {
      const latest=await checked(admin.from('team_sessions').select('*').eq('id',event.source_id).maybeSingle());
      if(!latest||!sessionStillDue(event,latest))break;
    }
    const rows=await checked(admin.rpc('campaign_push_recipients',{p_kind:event.kind,p_team_id:record.team_id||null,p_cursor:cursor}));
    if(!rows?.length)break;
    const counts=await deliverSubscriptions(rows,{
     claim:(row:any)=>checked(admin.rpc('claim_campaign_push',{p_event_id:event.id,p_subscription_id:row.id})),
     send:async(row:any)=>{
      const details=webpush.generateRequestDetails({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},payload,{vapidDetails:{subject:required('VAPID_SUBJECT'),publicKey:required('VAPID_PUBLIC_KEY'),privateKey:required('VAPID_PRIVATE_KEY')},TTL:event.kind==='session'?Math.max(1,Math.floor((Date.parse(record.starts_at)-Date.now())/1000)):3600,urgency:event.kind==='session'?'high':'normal'});
      const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:new Uint8Array(details.body),redirect:'error',signal:AbortSignal.timeout(5000)});await response.body?.cancel();return response.status;
     },
     remove:(row:any)=>checked(admin.from('push_subscriptions').delete().eq('id',row.id)),
     receipt:(row:any)=>checked(admin.from('campaign_push_deliveries').update({sent_at:new Date().toISOString()}).eq('event_id',event.id).eq('subscription_id',row.id)),
     release:(row:any)=>checked(admin.from('campaign_push_deliveries').delete().eq('event_id',event.id).eq('subscription_id',row.id).is('sent_at',null))
    });
    failed ||= counts.failed>0;
    for(const key of Object.keys(totals)) totals[key]+=counts[key];
    cursor=rows[rows.length-1].id;if(rows.length<20)break;
   }
   if(finished&&!failed)await checked(admin.from('campaign_push_events').update({completed_at:new Date().toISOString()}).eq('id',event.id));
   else await checked(admin.from('campaign_push_events').update({processing_at:null}).eq('id',event.id));
  }
  return Response.json(totals);
 }catch{console.error('Campaign push processing failed; no private details logged');return Response.json({error:'Delivery failed'},{status:500});}
});
