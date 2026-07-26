import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput, Permission } from '@smartdukaan/shared';
import { roleHasPermission } from '@smartdukaan/shared';
import { api, setAccessToken } from '../lib/api';

interface AuthValue {
  user: AuthUser | null;
  ready: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // On boot, try to restore a session from the refresh cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await api.tryRefresh();
      if (ok && !cancelled) {
        try {
          const me = await api.get<{ user: AuthUser }>('/auth/me');
          if (!cancelled) setUserState(me.user);
        } catch { /* fall through to logged-out */ }
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const res = await api.post<AuthResponse>('/auth/login', input);
    setAccessToken(res.accessToken);
    setUserState(res.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const res = await api.post<AuthResponse>('/auth/register', input);
    setAccessToken(res.accessToken);
    setUserState(res.user);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setAccessToken(null);
    setUserState(null);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    ready,
    login,
    register,
    logout,
    setUser: setUserState,
    can: (permission) => (user ? roleHasPermission(user.role, permission) : false),
  }), [user, ready, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
