-- Counts/codes only. Never prints row payloads, passwords or Vault values.
SELECT count(*) AS total_events,
  count(*) FILTER(WHERE delivered_at IS NOT NULL) AS delivered,
  count(*) FILTER(WHERE delivered_at IS NULL) AS pending,
  min(created_at) FILTER(WHERE delivered_at IS NULL) AS oldest_pending,
  max(delivered_at) AS last_success
FROM public.gm_backup_events;
SELECT payload->>'schema' AS source_schema,payload->>'table' AS source_table,
  count(*) AS events,count(*) FILTER(WHERE delivered_at IS NULL) AS pending,
  max(last_error_code) FILTER(WHERE delivered_at IS NULL) AS last_error_code
FROM public.gm_backup_events GROUP BY 1,2 ORDER BY 1,2;
