export type Urgency = "expired" | "urgent" | "soon" | "ok";

export function urgencyLevel(expiresAt: Date, now: Date = new Date()): Urgency {
  const diffHours = (expiresAt.getTime() - now.getTime()) / 3_600_000;
  if (diffHours <= 0) return "expired";
  if (diffHours <= 4) return "urgent";
  if (diffHours <= 24) return "soon";
  return "ok";
}

export function formatTimeRemaining(expiresAt: Date, now: Date = new Date()): string {
  const diffMinutes = Math.round((expiresAt.getTime() - now.getTime()) / 60_000);
  if (diffMinutes <= 0) return "פג תוקף";
  if (diffMinutes < 60) return `${diffMinutes} דקות`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} שעות`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} ימים`;
}
