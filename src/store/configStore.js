import { DEFAULT_CONFIG } from '../utils/constants';

const KEY = 'nexusfin_config';

export const loadConfig = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
};

export const saveConfig = (config) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Ignore persistence errors in Phase 1 local mode.
  }
};
