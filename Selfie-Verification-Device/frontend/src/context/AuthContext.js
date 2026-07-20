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
    authService
      .restoreSession()
      .then((next) => {
        if (!cancelled) setUser(next);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
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
      // Returns pending registration info — does not set session
      return await authService.register(payload);
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
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
    }),
    [user, isSuperAdmin, busy, booting, login, loginSuperAdmin, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
