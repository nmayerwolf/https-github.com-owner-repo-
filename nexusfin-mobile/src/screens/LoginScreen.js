import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const LoginScreen = ({ onSubmit, loading, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NexusFin Mobile</Text>
      <Text style={styles.subtitle}>Ingresá con tu cuenta</Text>

      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor="#6B7B8D"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        secureTextEntry
        placeholder="Contraseña"
        placeholderTextColor="#6B7B8D"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} disabled={loading} onPress={() => onSubmit({ email, password })}>
        <Text style={styles.buttonLabel}>{loading ? 'Ingresando...' : 'Iniciar sesión'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#080F1E'
  },
  title: {
    color: '#E0E7F0',
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    color: '#6B7B8D',
    marginTop: 6,
    marginBottom: 20
  },
  input: {
    backgroundColor: '#0F1A2E',
    borderColor: '#25324B',
    borderWidth: 1,
    borderRadius: 10,
    color: '#E0E7F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  button: {
    marginTop: 8,
    backgroundColor: '#00E08E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonLabel: {
    color: '#02130D',
    fontWeight: '700'
  },
  error: {
    color: '#FF6B6B',
    marginTop: 6
  }
});

export default LoginScreen;
