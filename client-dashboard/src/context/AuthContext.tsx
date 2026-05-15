import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { User } from "../types";
import { getOwnerForClient } from "../mock";
import { useClient } from "./ClientContext";

interface AuthContextValue {
  currentUser: User | null;
  signIn: (email: string) => void;
  signOut: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { client } = useClient();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const signIn = useCallback(
    (_email: string) => {
      const owner = getOwnerForClient(client.id);
      setCurrentUser(owner);
    },
    [client.id]
  );

  const signOut = useCallback(() => {
    setCurrentUser(null);
  }, []);

  const setUser = useCallback((user: User) => {
    setCurrentUser(user);
  }, []);

  const value = useMemo(
    () => ({ currentUser, signIn, signOut, setUser }),
    [currentUser, signIn, signOut, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
