import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { UserSummary } from "../types";
import { authAPI } from "../services/api";

interface AuthContextType {
  user: UserSummary | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  login: (token: string, user: UserSummary) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "sp_attendance_token";
const USER_KEY = "sp_attendance_user";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<UserSummary | null>(() => {
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const login = useCallback((newToken: string, newUser: UserSummary) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        try {
          const profile: any = await authAPI.getMe();
          const roleName: any = typeof profile.role === "object" && profile.role ? profile.role.name : profile.role;
          const refreshedUser: UserSummary = {
            id: String(profile.id),
            full_name: profile.full_name,
            phone_number: profile.phone_number,
            role: roleName,
            organization_name: "Shivam Patsanstha",
          };
          setUser(refreshedUser);
          localStorage.setItem(USER_KEY, JSON.stringify(refreshedUser));
        } catch {
          // Token invalid or expired
          logout();
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, [logout]);

  const refreshUser = async () => {
    if (!token) return;
    try {
      const profile: any = await authAPI.getMe();
      const roleName: any = typeof profile.role === "object" && profile.role ? profile.role.name : profile.role;
      const refreshedUser: UserSummary = {
        id: String(profile.id),
        full_name: profile.full_name,
        phone_number: profile.phone_number,
        role: roleName,
        organization_name: "Shivam Patsanstha",
      };
      setUser(refreshedUser);
      localStorage.setItem(USER_KEY, JSON.stringify(refreshedUser));
    } catch {
      logout();
    }
  };

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isAdmin,
    isSuperAdmin,
    login,
    logout,
    refreshUser,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
