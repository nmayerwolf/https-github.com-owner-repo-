import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { getThemePalette } from '../theme/palette';
import { typography } from '../theme/typography';

const DashboardScreen = ({ user, theme = 'dark' }) => {
  const palette = getThemePalette(theme);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [digest, setDigest] = useState(null);
  const [reco, setReco] = useState(null);
  const [crisis, setCrisis] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [digestOut, recoOut, crisisOut] = await Promise.all([api.getNewsDigestToday(), api.getRecoToday(), api.getCrisisToday()]);
        if (!active) return;
        setDigest(digestOut || null);
        setReco(recoOut || null);
        setCrisis(crisisOut || null);
      } catch (err) {
        if (!active) return;
        setError(String(err?.error?.message || err?.message || 'No se pudo cargar dashboard MVP.'));
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const strategic = Array.isArray(reco?.sections?.strategic) ? reco.sections.strategic : [];
  const opportunistic = Array.isArray(reco?.sections?.opportunistic) ? reco.sections.opportunistic : [];
  const riskAlerts = Array.isArray(reco?.sections?.riskAlerts) ? reco.sections.riskAlerts : [];
  const bullets = Array.isArray(digest?.bullets) ? digest.bullets : [];

  return (
    <ScrollView style={[styles.container, { backgroundColor: palette.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: palette.text }]}>Inicio</Text>
      <Text style={[styles.card, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}>Sesión activa: {user?.email}</Text>
      <Text style={[styles.muted, { color: palette.muted }]}>Resumen MVP diario.</Text>

      <View style={[styles.block, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.blockTitle, { color: palette.text }]}>Crisis Mode</Text>
        <Text style={[styles.body, { color: crisis?.isActive ? palette.danger : palette.positive }]}>
          {crisis?.isActive ? 'Activo' : 'Inactivo'}
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>{crisis?.summary || 'Sin datos de crisis para hoy.'}</Text>
      </View>

      <View style={[styles.block, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.blockTitle, { color: palette.text }]}>News Digest</Text>
        {bullets.slice(0, 6).map((line, idx) => (
          <Text key={`b-${idx}`} style={[styles.listItem, { color: palette.text }]}>
            • {line}
          </Text>
        ))}
        {!bullets.length ? <Text style={[styles.body, { color: palette.muted }]}>Sin bullets generados para hoy.</Text> : null}
      </View>

      <View style={[styles.block, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.blockTitle, { color: palette.text }]}>Recommendations</Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          Strategic: {strategic.length} · Opportunistic: {opportunistic.length} · Risk: {riskAlerts.length}
        </Text>
        {strategic.slice(0, 2).map((item) => (
          <Text key={item.ideaId || `${item.symbol}-s`} style={[styles.listItem, { color: palette.text }]}>
            • [S] {item.symbol || 'N/A'} {item.action || 'WATCH'} ({Math.round((Number(item.confidence) || 0) * 100)}%)
          </Text>
        ))}
        {opportunistic.slice(0, 1).map((item) => (
          <Text key={item.ideaId || `${item.symbol}-o`} style={[styles.listItem, { color: palette.text }]}>
            • [O] {item.symbol || 'N/A'} {item.action || 'WATCH'} ({Math.round((Number(item.confidence) || 0) * 100)}%)
          </Text>
        ))}
      </View>

      {loading ? <Text style={[styles.muted, { color: palette.muted }]}>Cargando resumen diario...</Text> : null}
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { ...typography.screenTitle, marginBottom: 12 },
  blockTitle: { ...typography.sectionTitle, marginBottom: 6 },
  body: { ...typography.body },
  listItem: { ...typography.body, marginTop: 4 },
  card: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  block: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  muted: { ...typography.body, marginTop: 10 }
  ,
  error: { ...typography.body, marginTop: 8 }
});

export default DashboardScreen;
