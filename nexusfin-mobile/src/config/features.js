import Constants from 'expo-constants';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

const rawMarketVisible = process.env.EXPO_PUBLIC_MARKET_VISIBLE ?? Constants.expoConfig?.extra?.marketVisible;
const rawRealtimeEnabled = process.env.EXPO_PUBLIC_REALTIME_ENABLED ?? Constants.expoConfig?.extra?.realtimeEnabled;

export const MARKET_VISIBLE = parseBool(rawMarketVisible, false);
export const REALTIME_ENABLED = parseBool(rawRealtimeEnabled, true);
