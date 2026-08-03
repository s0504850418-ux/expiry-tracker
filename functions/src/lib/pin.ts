import bcrypt from "bcryptjs";

export const SALT_ROUNDS = 12;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function secretMatches(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function recordFailure(
  currentFailedAttempts: number,
  now: Date,
): LockoutState {
  const failedAttempts = currentFailedAttempts + 1;
  const lockedUntil =
    failedAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
      : null;
  return { failedAttempts, lockedUntil };
}

export function recordSuccess(): LockoutState {
  return { failedAttempts: 0, lockedUntil: null };
}
