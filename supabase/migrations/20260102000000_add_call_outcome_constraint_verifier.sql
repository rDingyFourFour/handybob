-- Provide a lightweight helper to inspect the call outcome constraints.
CREATE OR REPLACE FUNCTION public.get_call_outcome_constraint_definitions()
RETURNS TABLE (
  constraint_name text,
  constraint_def text
)
STABLE
LANGUAGE sql
AS $$
  SELECT
    c.conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS constraint_def
  FROM pg_constraint c
  INNER JOIN pg_class tbl ON tbl.oid = c.conrelid
  INNER JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
  WHERE
    ns.nspname = 'public'
    AND tbl.relname = 'calls'
    AND c.conname IN (
      'calls_outcome_check',
      'calls_outcome_code_check'
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_call_outcome_constraint_definitions() TO public;
