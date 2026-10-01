import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authService.getSession());
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const next = await authService.restoreSession();
        if (!cancelled) setUser(next);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials, options) => {
    setBusy(true);
    try {
      const next = await authService.login(credentials, options);
      setUser(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const loginSuperAdmin = useCallback(async (credentials, options) => {
    setBusy(true);
    try {
      const next = await authService.loginSuperAdmin(credentials, options);
      setUser(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const register = useCallback(async (payload) => {
    setBusy(true);
    try {
      return await authService.register(payload);
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback((next) => {
    if (next) setUser(next);
  }, []);

  const isSuperAdmin = user?.role === 'superadmin';

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isSuperAdmin,
      busy,
      booting,
      rememberDefault: authService.isRememberEnabled(),
      login,
      loginSuperAdmin,
      register,
      logout,
      refreshUser,
    }),
    [
      user,
      isSuperAdmin,
      busy,
      booting,
      login,
      loginSuperAdmin,
      register,
      logout,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
