// Emit timestamps during builds so we can tell which modules are loaded before a Vercel hang.
export function buildLog(label: string) {
  if (process.env.BUILD_DIAGNOSTICS !== "1") {
    return;
  }

  console.log(`[build] ${new Date().toISOString()} - ${label}`);
}
