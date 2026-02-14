import * as SecureStore from 'expo-secure-store';
import { THEME_OPTIONS } from '../theme/palette';

const THEME_KEY = 'nexusfin_mobile_theme';

export const hydrateTheme = async () => {
  try {
    const saved = await SecureStore.getItemAsync(THEME_KEY);
    if (THEME_OPTIONS.includes(saved)) return saved;
  } catch {
    // keep default theme
  }
  return 'dark';
};

export const saveTheme = async (theme) => {
  if (!THEME_OPTIONS.includes(theme)) return;
  await SecureStore.setItemAsync(THEME_KEY, theme);
};
