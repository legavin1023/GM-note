# Player access setup

Players sign in at `/player-login` with the character row `username` as the login ID and their existing Supabase Auth password. The dropdown shows assigned usernames only; associated Auth emails stay on the server. The GM only links an existing Auth account to the matching team username; passwords are neither stored nor changed by this app.

Run `supabase/migration_player_access.sql` and then `supabase/migration_player_account_admin.sql` in the Supabase SQL Editor. If already applied, rerun the updated files in that order. This adds `character_name` while preserving `username` as the login ID. Existing usernames are not copied into character names; fill the new Character Name field in character profiles. From the repo root, run `supabase login` and `supabase link --project-ref YOUR_PROJECT_REF`, then deploy the `player-login` Edge Function with `supabase functions deploy player-login --no-verify-jwt`. The function uses Supabase-provided URL, anon key, and service role key environment variables. Player passwords remain managed by Supabase Auth.

To connect an account, open the character team in the GM app and pair the existing Auth account with its `username`. The team is derived from the existing `public.users.team_id`; this mapping does not assign or move the character. The GM account list shows Auth email and UUID only to the GM. Supabase passwords remain unchanged.

Manual Auth-to-username mapping is also available in SQL. The username must already exist in `public.users.username`; its team comes from `public.users.team_id`:

```sql
INSERT INTO public.player_team_members (user_id, login_username)
VALUES ('AUTH_USER_UUID', 'PLAYER_USERNAME');
```

Change the Auth-to-username mapping with:

```sql
UPDATE public.player_team_members
SET login_username = 'PLAYER_USERNAME'
WHERE user_id = 'AUTH_USER_UUID';
```

Remove player access with:

```sql
DELETE FROM public.player_team_members
WHERE user_id = 'AUTH_USER_UUID';
```

The SQL Editor should be used for these membership changes. Player accounts cannot read or edit this mapping table.
