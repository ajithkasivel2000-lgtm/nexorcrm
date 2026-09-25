import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the session token lives.
 *
 * The token IS the credential — anyone holding it can work as the user — so it
 * belongs in the platform's encrypted storage (Keychain / Keystore), not in
 * AsyncStorage next to display values: AsyncStorage is an unencrypted SQLite
 * file that a rooted device or an exposed backup can read.
 *
 * `authUser` (the display profile) stays in AsyncStorage; it is not a secret.
 *
 * Migration: builds before this change stored the token in AsyncStorage. The
 * first read moves it across once, so a plain app update does not sign anyone
 * out.
 */

const TOKEN_KEY = 'authToken'; // same name as before, so nothing else changes

let migrated = false;

async function migrateFromAsyncStorage() {
  if (migrated) return;
  migrated = true;
  try {
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(TOKEN_KEY, legacy);
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch (_) {
    // Migration is best-effort: SecureStore read/write failures surface below.
  }
}

export async function saveToken(token) {
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  } else {
    await clearToken();
  }
}

export async function getToken() {
  await migrateFromAsyncStorage();
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (_) {
    // Keychain/Keystore unavailable (e.g. device unlocked state): no token.
    return null;
  }
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  // Also clear any pre-migration copy left in AsyncStorage.
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}
