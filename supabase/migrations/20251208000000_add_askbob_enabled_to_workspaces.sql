-- Add a nullable flag for AskBob availability per workspace
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS askbob_enabled boolean;
