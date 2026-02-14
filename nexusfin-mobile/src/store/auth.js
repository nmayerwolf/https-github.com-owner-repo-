import * as SecureStore from 'expo-secure-store';
import { api, setToken } from '../api/client';

const TOKEN_KEY = 'nexusfin_mobile_token';

export const hydrateSession = async () => {
  const stored = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!stored) return null;
  setToken(stored);
  try {
    const me = await api.me();
    return { token: stored, user: me };
  } catch {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    return null;
  }
};

export const loginWithEmail = async ({ email, password }) => {
  const out = await api.login(email, password);
  if (!out?.token) throw new Error('El backend no devolvió token mobile');
  setToken(out.token);
  await SecureStore.setItemAsync(TOKEN_KEY, out.token);
  const me = await api.me();
  return { token: out.token, user: me };
};

export const logoutSession = async () => {
  setToken(null);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
};
