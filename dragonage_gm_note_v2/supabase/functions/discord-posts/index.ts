import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {discordPostPayload} from './payload.mjs';
const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error('Missing server setting');return v;};
Deno.serve(async(request)=>{
 if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try {
  const digest=async(v:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
  const [a,b]=await Promise.all([digest(request.headers.get('x-push-webhook-secret')||''),digest(required('PUSH_WEBHOOK_SECRET'))]);
  if(a.reduce((d,v,i)=>d|(v^b[i]),0))return Response.json({error:'Unauthorized'},{status:401});
  const body=await request.json().catch(()=>null);
  if(body?.action!=='drain')return Response.json({error:'Invalid action'},{status:400});
  const webhook=new URL(required('DISCORD_POST_WEBHOOK_URL'));
  if(webhook.protocol!=='https:'||webhook.hostname!=='discord.com'||webhook.port||!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(webhook.pathname))throw new Error('Invalid Discord webhook');
  webhook.search='?wait=true';
  const admin=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const checked=async(op:any)=>{const r=await op;if(r.error)throw r.error;return r.data;};
  if(!await checked(admin.rpc('push_board_is_shared')))return Response.json({error:'Board access is restricted; delivery stopped'},{status:409});
  const rows=await checked(admin.from('discord_post_deliveries').select('post_id').is('sent_at',null).gt('created_at',new Date(Date.now()-86400000).toISOString()).order('created_at').limit(5));
  let sent=0,failed=0;
  for(const row of rows||[]) {
   if(!await checked(admin.rpc('claim_discord_post',{p_post_id:row.post_id})))continue;
   try {
    const notice=await checked(admin.from('team_art_posts').select('id,team_id,nickname,content,image_paths,is_spoiler,created_at').eq('id',row.post_id).maybeSingle());
    if(!notice)continue;
    if(notice.team_id){
     const team=await checked(admin.from('teams').select('is_frozen').eq('id',notice.team_id).maybeSingle());
     if(!team||team.is_frozen)continue;
    }
    const response=await fetch(webhook.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(discordPostPayload(notice,required('PUSH_SITE_URL'))),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok){await response.body?.cancel();throw new Error(`Discord HTTP ${response.status}`);}
    const message=await response.json();if(!message.id)throw new Error('Missing Discord receipt');
    await checked(admin.from('discord_post_deliveries').update({sent_at:new Date().toISOString(),message_id:String(message.id)}).eq('post_id',row.post_id));sent++;
   }catch{
    await checked(admin.from('discord_post_deliveries').update({claimed_at:null}).eq('post_id',row.post_id).is('sent_at',null));failed++;
   }
  }
  console.info('Discord post delivery',{sent,failed});
  return Response.json({sent,failed},{status:failed?503:200});
 }catch{console.error('Discord post delivery configuration failed; private details suppressed');return Response.json({error:'Delivery configuration failed'},{status:500});}
});
