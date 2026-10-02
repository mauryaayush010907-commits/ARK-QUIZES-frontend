import { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";
import * as api from "../services/api";

const AuthContext = createContext(null);
const TOKEN_KEY = "ARK-QUIZES.token";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  const persist = useCallback((nextToken, nextUser) => {
    const previousToken = localStorage.getItem(TOKEN_KEY);
    if (previousToken && previousToken !== nextToken) api.disconnectApiSocket(previousToken);
    setToken(nextToken);
    setUser(nextUser);
    setIsLoading(false);
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return undefined;
    }
    let active = true;
    setIsLoading(true);
    api.getSessionUser(token)
      .then((nextUser) => {
        if (active) setUser(nextUser);
      })
      .catch(() => {
        if (active) persist(null, null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [token, persist]);

  const login = useCallback(async (email, password) => {
    const res = await api.login({ email, password });
    persist(res.token, res.user);
    return res.user;
  }, [persist]);

  const register = useCallback(async (payload) => {
    const res = await api.register(payload);
    persist(res.token, res.user);
    return res.user;
  }, [persist]);

  const logout = useCallback(() => persist(null, null), [persist]);

  const value = useMemo(
    () => ({ token, user, isLoading, login, register, logout, isAdmin: user?.role === "admin" }),
    [token, user, isLoading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
