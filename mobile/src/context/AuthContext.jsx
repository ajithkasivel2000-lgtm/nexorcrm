import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/auth';
import { setOnAuthFailure, setBaseUrl } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on app launch
  useEffect(() => {
    (async () => {
      try {
        let savedUrl = await AsyncStorage.getItem('custom_server_url');
        // The backend's port moved from 7012 to 7003 (as in production); a
        // server address saved on the old port would otherwise stop working.
        if (savedUrl && /:7012(\/|$)/.test(savedUrl)) {
          savedUrl = savedUrl.replace(':7012', ':7003');
          await AsyncStorage.setItem('custom_server_url', savedUrl);
        }
        if (savedUrl) {
          setBaseUrl(savedUrl);
        }

        const stored = await authService.getStoredUser();
        if (stored) {
          setToken(stored.token);
          setUser(stored.user);
        }
      } catch (_) {
        // fresh start
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const result = await authService.login(email, password);
    // A two-factor account is not signed in yet: the screen asks for the code.
    if (result.twoFactorRequired) return result;
    setToken(result.token);
    setUser(result.user);
    return result;
  };

  const verifyTwoFactor = async (challenge, code) => {
    const result = await authService.verifyTwoFactor(challenge, code);
    setToken(result.token);
    setUser(result.user);
    return result;
  };

  const logout = async () => {
    await authService.logout();
    setToken(null);
    setUser(null);
  };

  /* A 401 from any API call means the backend session is gone (expired or
     revoked). Clear the in-memory session so the navigator flips back to
     Login instead of leaving the app looking signed in with a dead token. */
  useEffect(() => {
    setOnAuthFailure(() => {
      setToken(null);
      setUser(null);
    });
    return () => setOnAuthFailure(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, verifyTwoFactor, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
