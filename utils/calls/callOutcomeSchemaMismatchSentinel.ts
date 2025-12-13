let hasLoggedCallOutcomeSchemaMismatchSentinel = false;

export function hasCallOutcomeSchemaMismatchSentinelFired(): boolean {
  return hasLoggedCallOutcomeSchemaMismatchSentinel;
}

export function markCallOutcomeSchemaMismatchSentinelAsFired(): void {
  hasLoggedCallOutcomeSchemaMismatchSentinel = true;
}

export function resetCallOutcomeSchemaMismatchSentinelForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    return;
  }
  hasLoggedCallOutcomeSchemaMismatchSentinel = false;
}
