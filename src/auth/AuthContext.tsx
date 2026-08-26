import { createContext, useEffect, useState, type ReactNode } from "react";
import { onIdTokenChanged, signInWithCustomToken, signOut as firebaseSignOut, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase/config";
import { getBusinessId } from "../lib/businessId";

export type Role = "owner" | "shiftManager" | "worker";

export interface SessionClaims {
  businessId: string;
  role: Role;
  staffId?: string;
}

interface AuthState {
  user: User | null;
  claims: SessionClaims | null;
  loading: boolean;
}

export interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function parseClaims(claims: Record<string, unknown>): SessionClaims | null {
  if (
    typeof claims.businessId !== "string" ||
    (claims.role !== "owner" && claims.role !== "shiftManager" && claims.role !== "worker")
  ) {
    return null;
  }
  return {
    businessId: claims.businessId,
    role: claims.role,
    staffId: typeof claims.staffId === "string" ? claims.staffId : undefined,
  };
}

interface Props {
  children: ReactNode;
  // רק הטאבלט מפעיל את זה — "עובד/ת רגיל/ה" מקבל/ת session שקוף
  // אוטומטית בלי PIN/קוד (ראו CLAUDE.md, "שלוש רמות הרשאה").
  // מסך הניהול (/admin) לעולם לא — שם "אין claims" אמור להציג את
  // מסך כניסת ה-Google, לא להתחבר לבד כ-worker.
  enableWorkerFallback?: boolean;
}

export function AuthProvider({ children, enableWorkerFallback = false }: Props) {
  const [state, setState] = useState<AuthState>({
    user: null,
    claims: null,
    loading: true,
  });

  useEffect(() => {
    return onIdTokenChanged(auth, async (user) => {
      if (!user) {
        if (enableWorkerFallback) {
          try {
            const startWorkerSession = httpsCallable<{ businessId: string }, { token: string }>(
              functions,
              "startWorkerSession",
            );
            const { data } = await startWorkerSession({ businessId: getBusinessId() });
            await signInWithCustomToken(auth, data.token);
            // onIdTokenChanged יופעל שוב אוטומטית עם המשתמש/ת החדש/ה.
            return;
          } catch {
            // אין רשת/עסק לא נמצא וכו' — נשארים במצב "לא מחובר/ת" הרגיל
            // (TabletDashboard יטפל בזה כמו כל שגיאת רשת אחרת).
          }
        }
        setState({ user: null, claims: null, loading: false });
        return;
      }
      const idTokenResult = await user.getIdTokenResult();
      setState({
        user,
        claims: parseClaims(idTokenResult.claims),
        loading: false,
      });
    });
  }, [enableWorkerFallback]);

  const value: AuthContextValue = {
    ...state,
    signOut: () => firebaseSignOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
