import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import { getToken, clearToken } from './secureToken';

/**
 * Dynamically resolve the backend URL:
 *
 * - Physical device (Expo Go on phone):
 *     Use the Metro bundler's host IP (same machine as the backend)
 *     e.g. exp://192.168.1.14:8081  →  http://192.168.1.14:7003/api
 *
 * - Android emulator:
 *     10.0.2.2 maps to the host machine's localhost
 *
 * - iOS simulator:
 *     localhost works directly
 */
function getBaseUrl() {
  // Pull the host that Metro is running on — works for real devices on LAN
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0]; // strip port, keep IP
    return `http://${host}:7003/api`;
  }
  // Release builds have no Metro host, so fall back to the URL baked in at
  // build time (app.json -> extra.apiUrl) before the emulator-only defaults.
  const configured = Constants.expoConfig?.extra?.apiUrl;
  if (configured) return configured;
  // Fallback when hostUri is unavailable
  if (Platform.OS === 'android') return 'http://10.0.2.2:7003/api';
  return 'http://localhost:7003/api';
}

const BASE_URL = getBaseUrl();
console.log('[API] Base URL:', BASE_URL);

/* Registered by AuthContext: a 401 means the session row is gone/expired, so
   the in-memory user must be cleared too — otherwise the UI keeps looking
   signed in while every request goes out tokenless. */
let onAuthFailure = null;
let subscriptionAlerted = false;
export const setOnAuthFailure = (fn) => { onAuthFailure = fn; };

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export const setBaseUrl = (url) => {
  api.defaults.baseURL = url;
};

export const getApiBaseUrl = () => {
  return api.defaults.baseURL;
};

// Attach the session token to every request (encrypted storage — see secureToken.js)
api.interceptors.request.use(async (config) => {
  try {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch (_) {}
  return config;
});

// Handle 401 globally — clear stored credentials AND drop the in-memory
// session so the navigator returns to Login instead of limbo.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url = error.config?.url || '';
    // 402: the company's trial or subscription has lapsed — say so once.
    if (error.response?.status === 402 && !subscriptionAlerted) {
      subscriptionAlerted = true;
      Alert.alert('Subscription', error.response.data?.message || 'Your company subscription is not active. An administrator can renew it on the web app.');
    }
    if (error.response?.status === 401 && !url.includes('/auth/')) {
      await clearToken();
      await AsyncStorage.removeItem('authUser').catch(() => {});
      if (onAuthFailure) {
        try { onAuthFailure(); } catch (_) {}
      }
    }
    return Promise.reject(error);
  }
);

export default api;
