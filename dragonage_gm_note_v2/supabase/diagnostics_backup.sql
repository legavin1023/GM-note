SELECT pg_database_size(current_database()) AS database_bytes,
  (SELECT count(*) FROM storage.objects) AS storage_object_count,
  (SELECT coalesce(sum(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE 0 END), 0) FROM storage.objects) AS storage_bytes,
  (SELECT jsonb_agg(jsonb_build_object('name', name, 'public', public)) FROM storage.buckets) AS buckets,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS administrator_can_bypass_rls;
