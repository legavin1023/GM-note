-- Additive helper only: no table, row, RLS policy or login changes.
CREATE OR REPLACE FUNCTION public.drive_image_is_referenced(p_file_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
DECLARE col record; found_ref boolean;
BEGIN
  IF p_file_id IS NULL OR p_file_id !~ '^[A-Za-z0-9_-]{10,200}$' THEN
    RAISE EXCEPTION 'Invalid Drive file ID';
  END IF;
  FOR col IN
    SELECT c.table_schema,c.table_name,c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t USING(table_schema,table_name)
    WHERE c.table_schema='public' AND t.table_type='BASE TABLE'
      AND c.udt_name IN ('text','varchar','json','jsonb','_text','_varchar')
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE strpos(%I::text,$1)>0)',
      col.table_schema,col.table_name,col.column_name) INTO found_ref USING p_file_id;
    IF found_ref THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.drive_image_is_referenced(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_image_is_referenced(text) TO service_role;
