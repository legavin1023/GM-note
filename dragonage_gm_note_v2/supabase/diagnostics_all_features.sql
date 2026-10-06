-- Read-only Supabase project inventory and feature readiness checks.
-- Run in Supabase SQL Editor using an administrator/database-owner role.
-- This reports live database objects; it does not prove that every policy is
-- semantically correct, and it does not change data or schema.

WITH expected_relations(schema_name, relation_name, feature) AS (
  VALUES
    ('public', 'campaigns', 'Campaigns / manager workspace'),
    ('public', 'teams', 'Teams / team progress'),
    ('public', 'users', 'Characters / profiles'),
    ('public', 'scenarios', 'Scenario definitions'),
    ('public', 'scenario_questions', 'Scenario tracker questions'),
    ('public', 'question_choices', 'Scenario tracker choices'),
    ('public', 'progress_stages', 'Legacy tracker stages'),
    ('public', 'team_scenarios', 'Team tracker records'),
    ('public', 'team_scenario_answers', 'Team tracker answers'),
    ('public', 'team_scenario_gm_notes', 'GM tracker notes'),
    ('public', 'player_team_members', 'Player account mapping'),
    ('public', 'player_character_change_requests', 'Character edit requests'),
    ('public', 'images', 'Campaign/token gallery'),
    ('public', 'notices', 'Legacy notices'),
    ('public', 'global_notices', 'Shared announcements'),
    ('public', 'posts', 'Legacy team posts'),
    ('public', 'comments', 'Legacy team comments'),
    ('public', 'free_board_posts', 'Separate free board'),
    ('public', 'free_board_comments', 'Separate free board comments'),
    ('public', 'team_art_posts', 'Team artwork posts'),
    ('public', 'team_art_comments', 'Team artwork comments'),
    ('public', 'scenario_character_notes', 'Scenario character one-liners'),
    ('public', 'party_character_notes', 'Party member memories'),
    ('public', 'scenario_npcs', 'Scenario NPC directory'),
    ('public', 'scenario_npc_ratings', 'NPC ratings'),
    ('public', 'scenario_npc_comments', 'NPC comments')
), expected_columns(schema_name, relation_name, column_name, feature) AS (
  VALUES
    ('public','teams','progress_step','Team progress position'),
    ('public','progress_stages','is_active','Master-controlled tracker visibility'),
    ('public','users','team_id','Character team assignment'),
    ('public','users','pin','Character PIN hash storage'),
    ('public','users','role','Shared manager role (if stored on users)'),
    ('public','player_team_members','login_username','Player-to-character login mapping'),
    ('public','team_art_posts','image_paths','Artwork post image paths'),
    ('public','team_art_posts','is_spoiler','Artwork spoiler flag'),
    ('public','team_art_posts','character_tags','Character tagging'),
    ('public','team_art_posts','is_master_artwork','Master artwork tab'),
    ('public','team_art_comments','image_path','Artwork comment image path'),
    ('public','scenario_npcs','scenario_step','NPC scenario placement'),
    ('public','scenario_npcs','token_url','NPC token image'),
    ('public','scenario_npc_ratings','rating','NPC rating value'),
    ('public','scenario_character_notes','is_public','Scenario note public visibility'),
    ('public','scenario_character_notes','show_author','Scenario note author visibility'),
    ('public','party_character_notes','visibility','Party note private/team visibility'),
    ('public','party_character_notes','note_date','Party note date'),
    ('public','global_notices','title','Announcement title'),
    ('public','global_notices','content','Announcement body'),
    ('public','global_notices','source_key','Legacy notice import marker')
), expected_functions(function_name, feature) AS (
  VALUES
    ('current_user_is_gm','Shared manager authorization'),
    ('player_team_context','Player team scope'),
    ('player_character_context','Player character scope'),
    ('player_team_profiles','Safe player profile lookup'),
    ('player_team_gallery_images','Player team token gallery'),
    ('update_user_pin','Initial character PIN setup'),
    ('verify_user_pin','Character PIN verification'),
    ('player_visible_tracker_limit','Visible tracker step limit'),
    ('player_team_completed_stage','Tracker completion lookup'),
    ('player_can_view_completed_scenario','Scenario visibility check'),
    ('validate_team_art_character_tags','Artwork tag validation'),
    ('validate_character_memory_note','Memory note team and author validation'),
    ('team_art_author_profiles','Artwork author token/profile lookup'),
    ('set_free_board_author','Server-derived post/comment author'),
    ('set_global_notice_metadata','Server-derived notice author metadata'),
    ('set_scenario_npc_comment_author','Server-derived NPC comment author'),
    ('auto_complete_player_tracker_stage','Automatic tracker completion')
), checks AS (
  SELECT 'TABLE'::text AS category,
         e.feature AS item,
         CASE WHEN c.oid IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
         CASE WHEN c.oid IS NULL THEN 'Relation does not exist'
              ELSE format('%s.%s (RLS=%s)', e.schema_name, e.relation_name,
                CASE WHEN c.relrowsecurity THEN 'ON' ELSE 'OFF' END) END AS details
  FROM expected_relations e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = e.schema_name
  LEFT JOIN pg_catalog.pg_class c
    ON c.relnamespace = n.oid AND c.relname = e.relation_name
       AND c.relkind IN ('r','p','v','m','f')

  UNION ALL

  SELECT 'COLUMN', e.feature,
         CASE WHEN a.attname IS NULL THEN 'MISSING' ELSE 'OK' END,
         CASE WHEN a.attname IS NULL
              THEN format('%s.%s.%s is absent', e.schema_name, e.relation_name, e.column_name)
              ELSE format('%s.%s.%s : %s', e.schema_name, e.relation_name,
                          e.column_name, pg_catalog.format_type(a.atttypid, a.atttypmod)) END
  FROM expected_columns e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = e.schema_name
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = e.relation_name
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid AND a.attname = e.column_name
       AND a.attnum > 0 AND NOT a.attisdropped

  UNION ALL

  SELECT 'FUNCTION', e.feature,
         CASE WHEN p.oid IS NULL THEN 'MISSING' ELSE 'OK' END,
         COALESCE(pg_catalog.pg_get_function_identity_arguments(p.oid),
                  'public.' || e.function_name || '() not found')
  FROM expected_functions e
  LEFT JOIN pg_catalog.pg_proc p
    ON p.pronamespace = 'public'::regnamespace AND p.proname = e.function_name

  UNION ALL

  SELECT 'POLICY',
         format('%s.%s / %s', pol.schemaname, pol.tablename, pol.policyname),
         'INFO',
         format('command=%s roles=%s using=%s check=%s', pol.cmd,
                pol.roles::text, COALESCE(pol.qual, '-'), COALESCE(pol.with_check, '-'))
  FROM pg_catalog.pg_policies pol
  WHERE pol.schemaname = 'public'
    AND pol.tablename IN (
      'teams','users','scenarios','scenario_questions','question_choices',
      'team_scenarios','team_scenario_answers','player_character_change_requests',
      'images','notices','global_notices','free_board_posts','free_board_comments',
      'team_art_posts','team_art_comments','scenario_character_notes',
      'party_character_notes','scenario_npcs',
      'scenario_npc_ratings','scenario_npc_comments'
    )

  UNION ALL

  SELECT 'CONSTRAINT', 'Artwork maximum image count',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_catalog.pg_constraint con
           WHERE con.conrelid = pg_catalog.to_regclass('public.team_art_posts')
             AND con.conname = 'team_art_posts_max_images'
             AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%10%'
         ) THEN 'OK' ELSE 'MISSING/WRONG' END,
         COALESCE((SELECT pg_catalog.pg_get_constraintdef(con.oid)
                   FROM pg_catalog.pg_constraint con
                   WHERE con.conrelid = pg_catalog.to_regclass('public.team_art_posts')
                     AND con.conname = 'team_art_posts_max_images'),
                  'team_art_posts_max_images constraint not found')
  WHERE pg_catalog.to_regclass('public.team_art_posts') IS NOT NULL

  UNION ALL

  SELECT 'STORAGE BUCKET', b.id,
         'INFO',
         format('public=%s file_size_limit=%s allowed_mime_types=%s',
                b.public, COALESCE(b.file_size_limit::text, 'unlimited'),
                COALESCE(b.allowed_mime_types::text, 'any'))
  FROM storage.buckets b

  UNION ALL

  SELECT 'REALTIME', 'public.notices',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_catalog.pg_publication_tables pt
           WHERE pt.pubname = 'supabase_realtime'
             AND pt.schemaname = 'public' AND pt.tablename = 'notices'
         ) THEN 'OK' ELSE 'NOT PUBLISHED' END,
         'Existing whole-notice table publication membership'

  UNION ALL

  SELECT 'REALTIME', 'public.global_notices',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_catalog.pg_publication_tables pt
           WHERE pt.pubname = 'supabase_realtime'
             AND pt.schemaname = 'public' AND pt.tablename = 'global_notices'
         ) THEN 'OK' ELSE 'NOT PUBLISHED' END,
         'Realtime publication membership'

  UNION ALL

  SELECT 'TRIGGER', format('%s.%s', trg.event_object_table, trg.trigger_name),
         'INFO', format('events=%s action=%s', trg.event_manipulation, trg.action_statement)
  FROM information_schema.triggers trg
  WHERE trg.trigger_schema = 'public'
    AND trg.event_object_table IN (
      'team_art_posts','team_art_comments','global_notices',
      'team_scenario_answers','player_character_change_requests'
    )
)
SELECT category, item, status, details
FROM checks
ORDER BY CASE category
  WHEN 'TABLE' THEN 1 WHEN 'COLUMN' THEN 2 WHEN 'FUNCTION' THEN 3
  WHEN 'POLICY' THEN 4 WHEN 'CONSTRAINT' THEN 5
  WHEN 'STORAGE BUCKET' THEN 6 WHEN 'REALTIME' THEN 7 ELSE 8 END,
  item;
