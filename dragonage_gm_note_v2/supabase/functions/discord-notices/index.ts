import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {discordNoticePayload} from './payload.mjs';
const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error('Missing server setting');return v;};
Deno.serve(async(request)=>{
 if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try {
  const digest=async(v:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
  const [a,b]=await Promise.all([digest(request.headers.get('x-push-webhook-secret')||''),digest(required('PUSH_WEBHOOK_SECRET'))]);
  if(a.reduce((d,v,i)=>d|(v^b[i]),0))return Response.json({error:'Unauthorized'},{status:401});
  const body=await request.json().catch(()=>null);
  if(body?.action!=='drain')return Response.json({error:'Invalid action'},{status:400});
  const webhook=new URL(required('DISCORD_NOTICE_WEBHOOK_URL'));
  if(webhook.protocol!=='https:'||webhook.hostname!=='discord.com'||webhook.port||!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(webhook.pathname))throw new Error('Invalid Discord webhook');
  webhook.search='?wait=true';
  const admin=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const checked=async(op:any)=>{const r=await op;if(r.error)throw r.error;return r.data;};
  const rows=await checked(admin.from('discord_notice_deliveries').select('notice_id').is('sent_at',null).gt('created_at',new Date(Date.now()-86400000).toISOString()).order('created_at').limit(5));
  let sent=0,failed=0;
  for(const row of rows||[]) {
   if(!await checked(admin.rpc('claim_discord_notice',{p_notice_id:row.notice_id})))continue;
   try {
    const notice=await checked(admin.from('notices').select('id,title,content,created_at').eq('id',row.notice_id).maybeSingle());
    if(!notice)continue;
    const response=await fetch(webhook.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(discordNoticePayload(notice,required('PUSH_SITE_URL'))),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok){await response.body?.cancel();throw new Error(`Discord HTTP ${response.status}`);}
    const message=await response.json();if(!message.id)throw new Error('Missing Discord receipt');
    await checked(admin.from('discord_notice_deliveries').update({sent_at:new Date().toISOString(),message_id:String(message.id)}).eq('notice_id',row.notice_id));sent++;
   }catch{
    await checked(admin.from('discord_notice_deliveries').update({claimed_at:null}).eq('notice_id',row.notice_id).is('sent_at',null));failed++;
   }
  }
  console.info('Discord notice delivery',{sent,failed});
  return Response.json({sent,failed},{status:failed?503:200});
 }catch{console.error('Discord notice delivery configuration failed; private details suppressed');return Response.json({error:'Delivery configuration failed'},{status:500});}
});
