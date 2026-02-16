import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getThemePalette } from '../theme/palette';

const LoginScreen = ({ onOAuth, loading, error, oauthProviders, oauthLoading = false, theme = 'dark' }) => {
  const palette = getThemePalette(theme);

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Horsy</Text>
      <Text style={[styles.subtitle, { color: palette.muted }]}>Ingresá con Google</Text>

      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}

      <Pressable
        style={[styles.button, { backgroundColor: palette.primary }]}
        disabled={loading || oauthLoading || !oauthProviders?.google}
        onPress={() => onOAuth?.('google')}
      >
        <Text style={[styles.buttonLabel, { color: palette.primaryText }]}>{loading || oauthLoading ? 'Ingresando...' : 'Continuar con Google'}</Text>
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
  title: {
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 20
  },
  button: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonLabel: {
    fontWeight: '700'
  },
  error: {
    color: '#FF6B6B',
    marginTop: 6
  }
});

export default LoginScreen;
