// A tenant renamed "RETIRED ..." is a shut-down account kept only so its old
// rows still resolve. It is not a client, so no admin list offers it as one:
// left in, it sits in every client picker waiting to be chosen by mistake.
// Renaming is how the retirement is recorded (there is no archived column), so
// the name is what this reads.
export function isRetiredTenant(t: { name?: string | null }): boolean {
  return /^retired\b/i.test((t.name ?? "").trim());
}
