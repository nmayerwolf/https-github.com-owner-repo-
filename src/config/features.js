const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

export const MARKET_VISIBLE = parseBool(import.meta.env.VITE_MARKET_VISIBLE, false);
export const REALTIME_ENABLED = parseBool(import.meta.env.VITE_REALTIME_ENABLED, true);
export const IDEAS_ADMIN_CONTROLS = parseBool(import.meta.env.VITE_IDEAS_ADMIN_CONTROLS, false);
