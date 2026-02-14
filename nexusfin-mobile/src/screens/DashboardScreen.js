import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const DashboardScreen = ({ user }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.card}>Sesión activa: {user?.email}</Text>
      <Text style={styles.muted}>MVP mobile de Fase 3 (Expo + push nativo).</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080F1E', padding: 16 },
  title: { color: '#E0E7F0', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  card: {
    color: '#E0E7F0',
    backgroundColor: '#0F1A2E',
    borderColor: '#25324B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  muted: { color: '#6B7B8D', marginTop: 10 }
});

export default DashboardScreen;
