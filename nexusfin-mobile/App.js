import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MarketsScreen from './src/screens/MarketsScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import GroupsScreen from './src/screens/GroupsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { api } from './src/api/client';
import { hydrateSession, loginWithToken, logoutSession } from './src/store/auth';
import { hydrateTheme, saveTheme } from './src/store/theme';
import { getThemePalette } from './src/theme/palette';
import { typography } from './src/theme/typography';
import { MARKET_VISIBLE } from './src/config/features';

const TABS = MARKET_VISIBLE ? ['dashboard', 'markets', 'alerts', 'groups', 'settings'] : ['dashboard', 'alerts', 'groups', 'settings'];
const TAB_LABEL = {
  dashboard: 'Inicio',
  markets: 'Mercados',
  alerts: 'Alertas',
  groups: 'Grupos',
  settings: 'Ajustes'
};

const App = () => {
  const [booting, setBooting] = useState(true);
  const [authError, setAuthError] = useState('');
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [theme, setTheme] = useState('dark');
  const [oauthProviders, setOauthProviders] = useState({ google: false, apple: false });
  const [oauthLoading, setOauthLoading] = useState(false);

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

  useEffect(() => {
    let active = true;
    api
      .getOAuthProviders()
      .then((out) => {
        if (!active) return;
        setOauthProviders({ google: !!out?.google, apple: !!out?.apple });
      })
      .catch(() => {
        if (!active) return;
        setOauthProviders({ google: false, apple: false });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!MARKET_VISIBLE && tab === 'markets') {
      setTab('dashboard');
    }
  }, [tab]);

  useEffect(() => {
    let active = true;
    const handleOAuthUrl = async (url) => {
      if (!url || !active) return;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'nexusfin:' || parsed.hostname !== 'oauth') return;

        const oauthError = parsed.searchParams.get('oauth_error');
        if (oauthError) {
          setAuthError(`OAuth falló: ${oauthError}`);
          return;
        }

        const token = parsed.searchParams.get('token');
        if (!token) return;
        setOauthLoading(true);
        setAuthError('');
        const out = await loginWithToken(token);
        if (!active) return;
        setSession(out);
      } catch {
        if (!active) return;
        setAuthError('No se pudo completar login OAuth.');
      } finally {
        if (active) setOauthLoading(false);
      }
    };

    Linking.getInitialURL().then((url) => handleOAuthUrl(url)).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleOAuthUrl(url);
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const loginWithOAuth = async (provider) => {
    setOauthLoading(true);
    setAuthError('');
    try {
      const url = api.getMobileOAuthUrl(provider);
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('No se pudo abrir OAuth');
      await Linking.openURL(url);
    } catch (error) {
      setAuthError(error?.message || 'No se pudo iniciar OAuth.');
    } finally {
      setOauthLoading(false);
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
        <LoginScreen
          onOAuth={loginWithOAuth}
          loading={oauthLoading}
          oauthLoading={oauthLoading}
          oauthProviders={oauthProviders}
          error={authError}
          theme={theme}
        />
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
        {!onboardingPending && MARKET_VISIBLE && tab === 'markets' ? <MarketsScreen theme={theme} /> : null}
        {!onboardingPending && tab === 'alerts' ? <AlertsScreen theme={theme} /> : null}
        {!onboardingPending && tab === 'groups' ? <GroupsScreen theme={theme} /> : null}
        {!onboardingPending && tab === 'settings' ? <SettingsScreen onLogout={logout} theme={theme} onThemeChange={handleThemeChange} /> : null}
      </View>

      {!onboardingPending ? (
        <View style={[styles.tabs, { borderTopColor: palette.border, backgroundColor: palette.surface }]}>
          {TABS.map((item) => (
            <Pressable
              key={item}
              onPress={() => setTab(item)}
              style={[styles.tab, tab === item ? [styles.tabActive, { backgroundColor: palette.surfaceAlt }] : null]}
              accessibilityRole="button"
              accessibilityLabel={`Ir a ${TAB_LABEL[item] || item}`}
              hitSlop={8}
            >
              <TabLabel style={[styles.tabLabel, { color: palette.muted }, tab === item ? [styles.tabLabelActive, { color: palette.primary }] : null]}>
                {TAB_LABEL[item] || item}
              </TabLabel>
              {tab === item ? <View style={[styles.activeDot, { backgroundColor: palette.primary }]} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const TabLabel = ({ children, style }) => (
  <Text numberOfLines={1} ellipsizeMode="tail" style={style}>
    {children}
  </Text>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { ...typography.body },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1
  },
  tab: { flex: 1, minHeight: 58, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  tabActive: {},
  tabLabel: { ...typography.caption, textAlign: 'center' },
  tabLabelActive: {},
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 5
  }
});

export default App;
