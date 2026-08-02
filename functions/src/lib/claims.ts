export type Role = "owner" | "shiftManager";

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
