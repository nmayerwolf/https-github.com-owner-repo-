import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getThemePalette } from '../theme/palette';

const DashboardScreen = ({ user, theme = 'dark' }) => {
  const palette = getThemePalette(theme);
  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Dashboard</Text>
      <Text style={[styles.card, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}>Sesión activa: {user?.email}</Text>
      <Text style={[styles.muted, { color: palette.muted }]}>MVP mobile de Fase 3 (Expo + push nativo).</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  muted: { marginTop: 10 }
});

export default DashboardScreen;
