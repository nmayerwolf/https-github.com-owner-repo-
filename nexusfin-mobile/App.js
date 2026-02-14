import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MarketsScreen from './src/screens/MarketsScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { hydrateSession, loginWithEmail, logoutSession } from './src/store/auth';

const TABS = ['dashboard', 'markets', 'alerts', 'settings'];

const App = () => {
  const [booting, setBooting] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('dashboard');

  const onboardingPending = session?.user?.onboardingCompleted === false;

  useEffect(() => {
    let mounted = true;
    hydrateSession()
      .then((out) => {
        if (!mounted) return;
        setSession(out);
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

  if (booting) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.muted}>Cargando sesión...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.root}>
        <LoginScreen onSubmit={login} loading={authLoading} error={authError} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        {onboardingPending ? (
          <OnboardingScreen
            onDone={(user) => {
              setSession((prev) => (prev ? { ...prev, user: { ...prev.user, ...(user || {}), onboardingCompleted: true } } : prev));
              setTab('dashboard');
            }}
          />
        ) : null}
        {!onboardingPending && tab === 'dashboard' ? <DashboardScreen user={session.user} /> : null}
        {!onboardingPending && tab === 'markets' ? <MarketsScreen /> : null}
        {!onboardingPending && tab === 'alerts' ? <AlertsScreen /> : null}
        {!onboardingPending && tab === 'settings' ? <SettingsScreen onLogout={logout} /> : null}
      </View>

      {!onboardingPending ? (
        <View style={styles.tabs}>
          {TABS.map((item) => (
            <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item ? styles.tabActive : null]}>
              <Text style={[styles.tabLabel, tab === item ? styles.tabLabelActive : null]}>{item.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080F1E' },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: '#6B7B8D' },
  tabs: {
    flexDirection: 'row',
    borderTopColor: '#25324B',
    borderTopWidth: 1,
    backgroundColor: '#0F1A2E'
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { backgroundColor: '#15243B' },
  tabLabel: { color: '#6B7B8D', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#00E08E' }
});

export default App;
