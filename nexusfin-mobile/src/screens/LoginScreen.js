import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getThemePalette } from '../theme/palette';

const LoginScreen = ({ onSubmit, onOAuth, loading, error, oauthProviders, oauthLoading = false, theme = 'dark' }) => {
  const palette = getThemePalette(theme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>NexusFin Mobile</Text>
      <Text style={[styles.subtitle, { color: palette.muted }]}>Ingresá con tu cuenta</Text>

      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor={palette.muted}
        style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        secureTextEntry
        placeholder="Contraseña"
        placeholderTextColor={palette.muted}
        style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}

      <Pressable style={[styles.button, { backgroundColor: palette.primary }]} disabled={loading} onPress={() => onSubmit({ email, password })}>
        <Text style={[styles.buttonLabel, { color: palette.primaryText }]}>{loading ? 'Ingresando...' : 'Iniciar sesión'}</Text>
      </Pressable>

      <Text style={[styles.oauthLabel, { color: palette.muted }]}>o continuar con</Text>
      <View style={styles.oauthRow}>
        <Pressable
          style={[styles.oauthBtn, { backgroundColor: palette.secondaryButton, borderColor: palette.border }]}
          disabled={loading || oauthLoading || !oauthProviders?.google}
          onPress={() => onOAuth?.('google')}
        >
          <Text style={[styles.oauthBtnLabel, { color: palette.text }]}>{oauthLoading ? '...' : 'Google'}</Text>
        </Pressable>
        <Pressable
          style={[styles.oauthBtn, { backgroundColor: palette.secondaryButton, borderColor: palette.border }]}
          disabled={loading || oauthLoading || !oauthProviders?.apple}
          onPress={() => onOAuth?.('apple')}
        >
          <Text style={[styles.oauthBtnLabel, { color: palette.text }]}>{oauthLoading ? '...' : 'Apple'}</Text>
        </Pressable>
      </View>
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
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
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
  oauthLabel: {
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center'
  },
  oauthRow: {
    flexDirection: 'row',
    gap: 8
  },
  oauthBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  oauthBtnLabel: {
    fontWeight: '700'
  },
  error: {
    color: '#FF6B6B',
    marginTop: 6
  }
});

export default LoginScreen;
