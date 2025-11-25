export function buildLog(label: string) {
  if (!process.env.BUILD_DIAGNOSTICS) {
    return;
  }

  const timestamp = new Date().toISOString();
  console.log(`[build] ${timestamp} - ${label}`);
}
