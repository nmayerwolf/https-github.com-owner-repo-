import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MarketsScreen from './src/screens/MarketsScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { hydrateSession, loginWithEmail, logoutSession } from './src/store/auth';
import { hydrateTheme, saveTheme } from './src/store/theme';
import { getThemePalette } from './src/theme/palette';

const TABS = ['dashboard', 'markets', 'alerts', 'settings'];

const App = () => {
  const [booting, setBooting] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [theme, setTheme] = useState('dark');

  const palette = getThemePalette(theme);

  const onboardingPending = session?.user?.onboardingCompleted === false;

  useEffect(() => {
    let mounted = true;
    Promise.all([hydrateSession(), hydrateTheme()])
      .then(([sessionOut, themeOut]) => {
        if (!mounted) return;
        setSession(sessionOut);
        setTheme(themeOut);
      })
      .finally(() => {
        if (mounted) setBooting(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const login = async ({ email, password }) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const out = await loginWithEmail({ email, password });
      setSession(out);
    } catch (error) {
      setAuthError(error?.message || 'No se pudo iniciar sesión');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await logoutSession();
    setSession(null);
    setTab('dashboard');
  };

  const handleThemeChange = async (nextTheme) => {
    setTheme(nextTheme);
    await saveTheme(nextTheme);
  };

  if (booting) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.muted, { color: palette.muted }]}>Cargando sesión...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]}>
        <LoginScreen onSubmit={login} loading={authLoading} error={authError} theme={theme} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]}>
      <View style={styles.content}>
        {onboardingPending ? (
          <OnboardingScreen
            theme={theme}
            onDone={(user) => {
              setSession((prev) => (prev ? { ...prev, user: { ...prev.user, ...(user || {}), onboardingCompleted: true } } : prev));
              setTab('dashboard');
            }}
          />
        ) : null}
        {!onboardingPending && tab === 'dashboard' ? <DashboardScreen user={session.user} theme={theme} /> : null}
        {!onboardingPending && tab === 'markets' ? <MarketsScreen theme={theme} /> : null}
        {!onboardingPending && tab === 'alerts' ? <AlertsScreen theme={theme} /> : null}
        {!onboardingPending && tab === 'settings' ? <SettingsScreen onLogout={logout} theme={theme} onThemeChange={handleThemeChange} /> : null}
      </View>

      {!onboardingPending ? (
        <View style={[styles.tabs, { borderTopColor: palette.border, backgroundColor: palette.surface }]}>
          {TABS.map((item) => (
            <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item ? [styles.tabActive, { backgroundColor: palette.surfaceAlt }] : null]}>
              <Text style={[styles.tabLabel, { color: palette.muted }, tab === item ? [styles.tabLabelActive, { color: palette.primary }] : null]}>
                {item.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: {},
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: {},
  tabLabel: { fontSize: 12, fontWeight: '600' },
  tabLabelActive: {}
});

export default App;
