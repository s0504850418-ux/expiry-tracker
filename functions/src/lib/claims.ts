export type Role = "owner" | "shiftManager" | "worker";

export interface SessionClaims {
  businessId: string;
  role: Role;
  staffId?: string;
}

export function ownerUid(businessId: string): string {
  return `owner_${businessId}`;
}

export function staffUid(businessId: string, staffId: string): string {
  return `staff_${businessId}_${staffId}`;
}

// זהות משותפת לכל session "עובד/ת רגיל/ה" (בלי PIN אישי) בעסק נתון —
// לא מזהה אדם ספציפי, ראו startWorkerSession.ts.
export function workerUid(businessId: string): string {
  return `worker_${businessId}`;
}
