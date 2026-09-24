import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export const authService = {
  async login(identifier, password) {
    // Backend expects field name "username" (accepts username OR email value)
    const res = await api.post('/auth/login', {
      username: identifier,
      password,
    });

    // Two-factor accounts: no token yet, just a challenge for the code step.
    if (res.data?.twoFactorRequired) {
      return { twoFactorRequired: true, challenge: res.data.challenge, message: res.data.message };
    }
    return this.storeSession(res.data);
  },

  /** Second step of a two-factor sign-in: the authenticator or recovery code. */
  async verifyTwoFactor(challenge, code) {
    const res = await api.post('/auth/2fa/verify', { challenge, code });
    return this.storeSession(res.data);
  },

  async storeSession({ token, user, sessionId }) {
    // Augment user with a display name since API returns firstName/lastName
    const enriched = {
      ...user,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
      role: user.status, // backend uses "status" as the role field
    };

    await AsyncStorage.setItem('authToken', token);
    await AsyncStorage.setItem('authUser', JSON.stringify(enriched));

    return { token, user: enriched, sessionId };
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // best effort
    }
    await AsyncStorage.multiRemove(['authToken', 'authUser']);
  },

  async getStoredUser() {
    const [token, userStr] = await Promise.all([
      AsyncStorage.getItem('authToken'),
      AsyncStorage.getItem('authUser'),
    ]);
    if (!token || !userStr) return null;
    return { token, user: JSON.parse(userStr) };
  },
};
