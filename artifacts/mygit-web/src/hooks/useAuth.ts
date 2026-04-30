import { useState, useCallback } from "react";

import { API_BASE } from "@/lib/api";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("mygit_user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function getStoredToken(): string | null {
  return localStorage.getItem("mygit_token");
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showModal, setShowModal] = useState(false);

  const requireAuth = useCallback(
    (action: () => void) => {
      if (user) {
        action();
        return;
      }
      setPendingAction(() => action);
      setShowModal(true);
    },
    [user],
  );

  const onLoginSuccess = useCallback(
    (userData: AuthUser, token: string) => {
      localStorage.setItem("mygit_token", token);
      localStorage.setItem("mygit_user", JSON.stringify(userData));
      setUser(userData);
      setShowModal(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    },
    [pendingAction],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("mygit_token");
    localStorage.removeItem("mygit_user");
    setUser(null);
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const token = getStoredToken();
      return fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
          ...(options.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(!options.body || typeof options.body === "string"
            ? { "Content-Type": "application/json" }
            : {}),
        },
      });
    },
    [],
  );

  return { user, requireAuth, showModal, setShowModal, onLoginSuccess, logout, authFetch };
}

export { getStoredToken };
