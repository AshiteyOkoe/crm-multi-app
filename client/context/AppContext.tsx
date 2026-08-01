"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken, clearToken } from "@/lib/api";
import type { Branch, User } from "@/types";

interface LoginResult {
  token: string;
  user: User;
}

interface AppContextValue {
  user: User | null;
  loading: boolean;
  branches: Branch[];
  unreadCount: number;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; password: string; phone?: string; branchId?: string; role?: string }) => Promise<User>;
  logout: () => void;
  refreshBranches: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUser = useCallback(async () => {
    if (!getToken()) return;
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  const refreshBranches = useCallback(async () => {
    try {
      const list = await api<Branch[]>("/branches");
      setBranches(list);
    } catch {
      // ignore
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await api<{ items: { isRead: boolean }[]; total: number }>("/branches/notifications", { params: { pageSize: 50 } });
      setUnreadCount(res.items.filter((n) => !n.isRead).length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (getToken()) {
        await refreshUser();
        await Promise.all([refreshBranches(), refreshNotifications()]);
      }
      setLoading(false);
    };
    init();
  }, [refreshUser, refreshBranches, refreshNotifications]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResult>("/auth/login", { method: "POST", body: { email, password }, auth: false });
    setToken(res.token);
    setUser(res.user);
    await Promise.all([refreshBranches(), refreshNotifications()]);
    return res.user;
  }, [refreshBranches, refreshNotifications]);

  const register = useCallback(async (data: { name: string; email: string; password: string; phone?: string; branchId?: string; role?: string }) => {
    const res = await api<LoginResult>("/auth/register", { method: "POST", body: data, auth: false });
    setToken(res.token);
    setUser(res.user);
    await refreshBranches();
    return res.user;
  }, [refreshBranches]);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setUnreadCount(0);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      branches,
      unreadCount,
      login,
      register,
      logout,
      refreshBranches,
      refreshNotifications,
      refreshUser,
      isAdmin: user?.role === "ADMIN",
      isManager: user?.role === "BRANCH_MANAGER" || user?.role === "ADMIN",
    }),
    [user, loading, branches, unreadCount, login, register, logout, refreshBranches, refreshNotifications, refreshUser]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
