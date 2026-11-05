// Run with ACTIVITY_PGLITE_PATH pointing to an installed @electric-sql/pglite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

test('activity SQL captures real trigger changes without credentials', {
  skip: !process.env.ACTIVITY_PGLITE_PATH,
}, async () => {
  const { PGlite } = require(process.env.ACTIVITY_PGLITE_PATH);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
      CREATE FUNCTION public.current_user_is_gm() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION public.player_character_context() RETURNS TABLE(character_id uuid) LANGUAGE sql AS $$ SELECT NULL::uuid WHERE false $$;
      CREATE TABLE public.users(id uuid PRIMARY KEY,username text,character_name text,level integer,password text,gm_secret text,updated_at timestamptz);
      CREATE TABLE public.teams(id uuid PRIMARY KEY,name text,progress_step integer,updated_at timestamptz);
      CREATE TABLE public.scenario_npcs(id uuid PRIMARY KEY,name text,scenario_step integer);
      CREATE TABLE public.scenario_npc_ratings(npc_id uuid,rating integer);
      CREATE TABLE public.scenario_npc_comments(npc_id uuid,content text);
      CREATE TABLE public.team_art_posts(id uuid PRIMARY KEY,team_id uuid,title text,content text);
      CREATE TABLE public.team_art_comments(id uuid PRIMARY KEY,post_id uuid,content text);
      CREATE TABLE public.player_team_members(user_id uuid,login_username text);
      CREATE TABLE public.scenarios(id uuid PRIMARY KEY,title text);
      CREATE TABLE public.team_scenarios(id uuid PRIMARY KEY,team_id uuid,scenario_id uuid,completed boolean);
      CREATE TABLE public.scenario_questions(id uuid PRIMARY KEY,prompt text);
      CREATE TABLE public.question_choices(id uuid PRIMARY KEY,question_id uuid,label text);
      CREATE TABLE public.team_scenario_answers(team_scenario_id uuid,question_id uuid,choice_id uuid);
      CREATE TABLE public.player_character_change_requests(character_id uuid,team_id uuid,requested_changes jsonb,status text);
    `);
    await db.exec(fs.readFileSync('supabase/migration_dashboard_activity_log.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migration_activity_details.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migration_activity_details.sql','utf8'));
    await db.exec(`INSERT INTO public.teams VALUES ('00000000-0000-0000-0000-000000000002','그리핀',1,now());
      UPDATE public.teams SET progress_step=5 WHERE name='그리핀';`);
    let row=(await db.query("SELECT * FROM public.app_activity_logs ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(row.feature,'팀 정보');
    assert.ok(row.entity_label.includes('그리핀'));
    assert.deepEqual(row.details,[{field:'progress_step',label:'진행 시나리오',before:'1',after:'5'}]);
    const count=(await db.query('SELECT count(*)::int AS count FROM public.app_activity_logs')).rows[0].count;
    await db.exec('UPDATE public.teams SET updated_at=now()');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.app_activity_logs')).rows[0].count,count);
    await db.exec(`INSERT INTO public.scenario_npcs VALUES ('00000000-0000-0000-0000-000000000003','모리건',4);
      INSERT INTO public.scenario_npc_ratings VALUES ('00000000-0000-0000-0000-000000000003',4);
      INSERT INTO public.scenario_npc_comments VALUES ('00000000-0000-0000-0000-000000000003','다시 만나고 싶어요');`);
    row=(await db.query('SELECT * FROM public.app_activity_logs ORDER BY id DESC LIMIT 1')).rows[0];
    assert.equal(row.feature,'주요 NPC 댓글');
    assert.equal(row.entity_label,'모리건');
    assert.equal(row.details[0].after,'다시 만나고 싶어요');
    await db.exec(`INSERT INTO public.users VALUES ('00000000-0000-0000-0000-000000000001','gm','관리자',1,'credential','secret',now());
      UPDATE public.users SET level=2,gm_secret='new secret',password='new credential';`);
    row=(await db.query('SELECT * FROM public.app_activity_logs ORDER BY id DESC LIMIT 1')).rows[0];
    assert.equal(row.details.find(d=>d.field==='level').after,'2');
    assert.equal(row.details.find(d=>d.field==='gm_secret').after,'비공개 내용');
    assert.ok(!JSON.stringify(row.details).includes('credential'));
    await db.exec(`INSERT INTO public.team_art_posts VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','그림 제목','본문');
      INSERT INTO public.team_art_comments VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','멋져요');
      DELETE FROM public.team_art_comments;`);
    row=(await db.query('SELECT * FROM public.app_activity_logs ORDER BY id DESC LIMIT 1')).rows[0];
    assert.equal(row.feature,'작품 댓글');
    assert.ok(row.entity_label.includes('그림 제목'));
    assert.ok(row.entity_label.includes('그리핀'));
    assert.equal(row.details[0].before,'멋져요');
    await db.exec(`INSERT INTO public.scenarios VALUES ('00000000-0000-0000-0000-000000000006','첫 모험');
      INSERT INTO public.team_scenarios VALUES ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000006',false);
      INSERT INTO public.scenario_questions VALUES ('00000000-0000-0000-0000-000000000008','누구를 도울까?');
      INSERT INTO public.question_choices VALUES ('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000008','마을 주민');
      INSERT INTO public.team_scenario_answers VALUES ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000009');`);
    row=(await db.query('SELECT * FROM public.app_activity_logs ORDER BY id DESC LIMIT 1')).rows[0];
    assert.ok(row.entity_label.includes('첫 모험'));
    assert.ok(row.entity_label.includes('그리핀'));
    assert.equal(row.details.find(d=>d.field==='choice_id').after,'마을 주민');
    assert.equal(row.details.find(d=>d.field==='question_id').after,'누구를 도울까?');
    await db.exec(`INSERT INTO public.player_character_change_requests VALUES (
      '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
      '{"level":3,"password":"NEVER_CAPTURE","gm_secret":"PRIVATE_VALUE"}','pending');`);
    row=(await db.query('SELECT * FROM public.app_activity_logs ORDER BY id DESC LIMIT 1')).rows[0];
    assert.ok(row.entity_label.includes('관리자'));
    assert.ok(JSON.stringify(row.details).includes('레벨: 3'));
    assert.ok(!JSON.stringify(row.details).includes('NEVER_CAPTURE'));
    assert.ok(!JSON.stringify(row.details).includes('PRIVATE_VALUE'));
  } finally { await db.close(); }
});
