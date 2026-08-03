import { createContext, useEffect, useState, type ReactNode } from "react";
import { onIdTokenChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "../firebase/config";

export type Role = "owner" | "shiftManager";

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
    (claims.role !== "owner" && claims.role !== "shiftManager")
  ) {
    return null;
  }
  return {
    businessId: claims.businessId,
    role: claims.role,
    staffId: typeof claims.staffId === "string" ? claims.staffId : undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    claims: null,
    loading: true,
  });

  useEffect(() => {
    return onIdTokenChanged(auth, async (user) => {
      if (!user) {
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
  }, []);

  const value: AuthContextValue = {
    ...state,
    signOut: () => firebaseSignOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
