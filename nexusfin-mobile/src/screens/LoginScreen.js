import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getThemePalette } from '../theme/palette';
import { typography } from '../theme/typography';

const LoginScreen = ({ onOAuth, loading, error, oauthProviders, oauthLoading = false, theme = 'dark' }) => {
  const palette = getThemePalette(theme);

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Horsai</Text>
      <Text style={[styles.subtitle, { color: palette.muted }]}>Iniciar sesión con Google</Text>

      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}

      <Pressable
        style={[styles.button, { backgroundColor: palette.primary }]}
        disabled={loading || oauthLoading || !oauthProviders?.google}
        onPress={() => onOAuth?.('google')}
        accessibilityRole="button"
        accessibilityLabel="Iniciar sesión con Google"
        hitSlop={8}
      >
        <Text style={[styles.buttonLabel, { color: palette.primaryText }]}>{loading || oauthLoading ? 'Ingresando...' : 'Iniciar sesión con Google'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  title: { ...typography.screenTitle, fontSize: 30 },
  subtitle: {
    ...typography.screenSubtitle,
    marginTop: 6,
    marginBottom: 20
  },
  button: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonLabel: { ...typography.buttonLabel },
  error: {
    ...typography.body,
    marginTop: 6
  }
});

export default LoginScreen;
