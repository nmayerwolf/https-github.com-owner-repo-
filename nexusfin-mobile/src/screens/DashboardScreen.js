import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getThemePalette } from '../theme/palette';
import { typography } from '../theme/typography';

const DashboardScreen = ({ user, theme = 'dark' }) => {
  const palette = getThemePalette(theme);
  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Inicio</Text>
      <Text style={[styles.card, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}>Sesión activa: {user?.email}</Text>
      <Text style={[styles.muted, { color: palette.muted }]}>Aplicación móvil de Horsy.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { ...typography.screenTitle, marginBottom: 12 },
  card: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  muted: { ...typography.body, marginTop: 10 }
});

export default DashboardScreen;
