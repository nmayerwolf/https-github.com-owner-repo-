import * as SecureStore from 'expo-secure-store';
import { api, setToken } from '../api/client';

const TOKEN_KEY = 'nexusfin_mobile_token';
const PUSH_SUBSCRIPTION_ID_KEY = 'nexusfin_mobile_push_subscription_id';

const syncPushSubscriptionId = async () => {
  try {
    const out = await api.getPushSubscriptions();
    const mobile = (out?.subscriptions || []).find((s) => s.platform === 'ios' || s.platform === 'android');
    if (mobile?.id) {
      await SecureStore.setItemAsync(PUSH_SUBSCRIPTION_ID_KEY, String(mobile.id));
      return;
    }
  } catch {
    // keep session even if subscriptions endpoint fails
  }

  await SecureStore.deleteItemAsync(PUSH_SUBSCRIPTION_ID_KEY);
};

export const hydrateSession = async () => {
  const stored = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!stored) return null;
  setToken(stored);
  try {
    const me = await api.me();
    await syncPushSubscriptionId();
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
  await syncPushSubscriptionId();
  return { token: out.token, user: me };
};

export const loginWithToken = async (jwtToken) => {
  const next = String(jwtToken || '').trim();
  if (!next) throw new Error('Token OAuth mobile inválido');
  setToken(next);
  await SecureStore.setItemAsync(TOKEN_KEY, next);
  const me = await api.me();
  await syncPushSubscriptionId();
  return { token: next, user: me };
};

export const logoutSession = async () => {
  try {
    const out = await api.getPushSubscriptions();
    const mobileSubs = (out?.subscriptions || []).filter((s) => s.platform === 'ios' || s.platform === 'android');
    for (const sub of mobileSubs) {
      try {
        await api.deletePushSubscription(sub.id);
      } catch {
        // continue attempting cleanup
      }
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

export const clearPushSubscriptionId = async () => {
  await SecureStore.deleteItemAsync(PUSH_SUBSCRIPTION_ID_KEY);
};

export const getPushSubscriptionId = async () => {
  return SecureStore.getItemAsync(PUSH_SUBSCRIPTION_ID_KEY);
};
