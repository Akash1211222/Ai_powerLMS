'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { setAccessToken } from './api-client';
import { authApi, type CurrentUser } from './auth-api';

const REFRESH_KEY = 'fca.refreshToken';

interface AuthState {
  user: CurrentUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function readRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}
function storeRefreshToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(REFRESH_KEY, token);
  else window.localStorage.removeItem(REFRESH_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const bootstrapped = useRef(false);

  const applyTokens = useCallback((accessToken: string, refreshToken: string) => {
    setAccessToken(accessToken);
    storeRefreshToken(refreshToken);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    setUser(me);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await authApi.login({ email, password });
      applyTokens(tokens.accessToken, tokens.refreshToken);
      await refreshUser();
    },
    [applyTokens, refreshUser],
  );

  const logout = useCallback(async () => {
    const refreshToken = readRefreshToken();
    if (refreshToken) await authApi.logout(refreshToken).catch(() => undefined);
    setAccessToken(null);
    storeRefreshToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Bootstrap: exchange a stored refresh token for a session on first load.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const refreshToken = readRefreshToken();
    if (!refreshToken) {
      setStatus('unauthenticated');
      return;
    }
    authApi
      .refresh(refreshToken)
      .then(async (tokens) => {
        applyTokens(tokens.accessToken, tokens.refreshToken);
        await refreshUser();
      })
      .catch(() => {
        storeRefreshToken(null);
        setAccessToken(null);
        setStatus('unauthenticated');
      });
  }, [applyTokens, refreshUser]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
