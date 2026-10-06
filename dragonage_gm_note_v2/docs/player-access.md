# Player access setup

Players use the existing `public.users.username` as their login ID and a 4-digit PIN as the password. Selecting a username checks PIN setup status on the server. If no PIN exists, the login form switches to first-time setup; the player enters the shared `Dragonage` code and chooses a PIN. A PIN is hashed in SQL and can only be initialized while the row has no PIN. Setup success continues through the same Edge Function and Supabase Auth session flow as regular login.

Apply `supabase/migration_player_access.sql` and `supabase/migration_player_account_admin.sql` in the Supabase SQL Editor after `migration_v2.sql`. Apply `supabase/migration_shared_gm_permissions.sql`, then `supabase/migration_player_pin_enrollment.sql` to add setup-state lookup and rate limiting. Re-run the updated `migration_player_account_admin.sql` if it was already applied so the player login username RPC returns usernames from `public.users`.

Deploy the Edge Function from the repository root:

```sh
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase functions deploy player-login --no-verify-jwt
```

The function uses the Supabase-provided URL, anon key, and service role key. On the first successful PIN login, it creates a hidden Supabase Auth identity and records its `username` in `player_team_members`. Players do not need to choose an Auth account or manage an email/password. RLS continues to derive team membership from the matching `public.users.team_id`.

The setup code is the same `Dragonage` value for all accounts and is reusable across different accounts. Each account can initialize its PIN only once; an already-set PIN is never overwritten by first-time setup. Treat the shared code as an onboarding convenience, not as strong proof of identity.

The team detail page does not need account linking. The existing username and team fields remain the source of truth.

Apply these migrations after the account migrations, in this order:

1. `supabase/migration_player_team_assets.sql` exposes non-secret campaign
   character profiles and campaign token/gallery images through scoped RPCs.
2. `supabase/migration_player_tracker_visibility.sql` lets players see scenarios
   their team completed strictly before its current progress step, plus other
   teams' completed answers for those scenarios. Players may edit answers only
   on their own team's visible tracker records.
3. `supabase/migration_player_character_change_requests.sql` lets players submit
   edits to their own non-secret character fields. The owning GM must approve a
   request before the profile changes.

The public roster and gallery do not return GM-only character notes. Publish the
frontend after applying the migrations.
