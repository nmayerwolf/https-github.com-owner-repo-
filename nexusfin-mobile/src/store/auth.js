import * as SecureStore from 'expo-secure-store';
import { api, setToken } from '../api/client';

const TOKEN_KEY = 'nexusfin_mobile_token';
const PUSH_SUBSCRIPTION_ID_KEY = 'nexusfin_mobile_push_subscription_id';

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
  try {
    const subId = await SecureStore.getItemAsync(PUSH_SUBSCRIPTION_ID_KEY);
    if (subId) {
      await api.deletePushSubscription(subId);
    }
  } catch {
    // keep logout flow even if unsubscribe fails
  }

  setToken(null);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(PUSH_SUBSCRIPTION_ID_KEY);
};

export const savePushSubscriptionId = async (id) => {
  if (!id) return;
  await SecureStore.setItemAsync(PUSH_SUBSCRIPTION_ID_KEY, String(id));
};
