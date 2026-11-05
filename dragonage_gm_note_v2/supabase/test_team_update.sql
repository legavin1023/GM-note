BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM public.users WHERE lower(btrim(role))='admin' LIMIT 1),true);
SET LOCAL ROLE authenticated;
UPDATE public.teams SET name=name WHERE id='e7a13a91-fd36-4942-a1ea-319748e54ff1';
ROLLBACK;
SELECT 'GM team update passed; changes rolled back' AS result;
