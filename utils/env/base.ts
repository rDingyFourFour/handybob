export function requireEnv(name: string, value: string | undefined | null) {
  if (!value || value.trim().length === 0) {
    throw new Error(`[env] ${name} must be defined and non-empty.`);
  }

  return value;
}
