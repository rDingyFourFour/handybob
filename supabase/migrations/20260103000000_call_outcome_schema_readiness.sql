-- Expose a lightweight readiness check for the call outcome schema.
CREATE OR REPLACE FUNCTION public.get_call_outcome_schema_readiness()
RETURNS TABLE (
  columns_present boolean,
  constraint_present boolean
)
STABLE
LANGUAGE sql
AS $$
  SELECT
    (
      SELECT COUNT(DISTINCT column_name)
      FROM information_schema.columns
      WHERE
        table_schema = 'public'
        AND table_name = 'calls'
        AND column_name IN ('reached_customer', 'outcome_code', 'outcome_notes')
    ) = 3 AS columns_present,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      INNER JOIN pg_class tbl ON tbl.oid = c.conrelid
      INNER JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      WHERE
        ns.nspname = 'public'
        AND tbl.relname = 'calls'
        AND c.conname = 'calls_outcome_code_check'
    ) AS constraint_present;
$$;

GRANT EXECUTE ON FUNCTION public.get_call_outcome_schema_readiness() TO public;
