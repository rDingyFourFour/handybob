import { requireEnv } from "./base";

export function getServiceRoleKey() {
  return requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
