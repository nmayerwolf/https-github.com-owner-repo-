import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { registerNativePush } from '../lib/push';
import { getThemePalette } from '../theme/palette';
import { typography } from '../theme/typography';

const RISK_OPTIONS = ['conservador', 'moderado', 'agresivo'];
const HORIZON_OPTIONS = ['corto', 'mediano', 'largo'];
const SECTOR_OPTIONS = ['tech', 'finance', 'health', 'energy', 'auto', 'crypto', 'metals', 'bonds', 'fx'];

const OnboardingScreen = ({ onDone, theme = 'dark' }) => {
  const palette = getThemePalette(theme);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState({
    riskProfile: 'moderado',
    sectors: ['tech', 'crypto', 'metals'],
    horizon: 'mediano',
    pushEnabled: false
  });

  const canNext = useMemo(() => {
    if (step === 2) return state.sectors.length > 0;
    return true;
  }, [step, state.sectors.length]);

  useEffect(() => {
    let active = true;
    api
      .getConfig()
      .then((cfg) => {
        if (!active || !cfg) return;
        setState((prev) => ({
          ...prev,
          riskProfile: cfg.riskProfile || prev.riskProfile,
          sectors: Array.isArray(cfg.sectors) && cfg.sectors.length ? cfg.sectors : prev.sectors,
          horizon: cfg.horizon || prev.horizon
        }));
      })
      .catch(() => {
        if (!active) return;
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const toggleSector = (sector) => {
    setState((prev) => {
      const has = prev.sectors.includes(sector);
      if (has) return { ...prev, sectors: prev.sectors.filter((s) => s !== sector) };
      return { ...prev, sectors: [...prev.sectors, sector] };
    });
  };

  const enablePush = async () => {
    setPushLoading(true);
    setError('');
    setMessage('');
    try {
      const out = await registerNativePush();
      await api.subscribePush(out);
      setState((prev) => ({ ...prev, pushEnabled: true }));
      setMessage('Push nativo activado.');
    } catch (err) {
      setError(err?.message || 'No se pudo activar push nativo.');
    } finally {
      setPushLoading(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.updateConfig({
        riskProfile: state.riskProfile,
        sectors: state.sectors,
        horizon: state.horizon
      });
      const me = await api.updateMe({ onboardingCompleted: true });
      onDone?.(me);
    } catch (err) {
      setError(err?.message || 'No se pudo finalizar onboarding.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: palette.text }]}>Onboarding</Text>
        <Text style={[styles.muted, { color: palette.muted }]}>Cargando preferencias...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: palette.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={[styles.title, { color: palette.text }]}>Onboarding guiado</Text>
      <Text style={[styles.muted, { color: palette.muted }]}>Paso {step}/4</Text>
      <View style={[styles.progressTrack, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
        <View style={[styles.progressFill, { width: `${(step / 4) * 100}%`, backgroundColor: palette.primary }]} />
      </View>

      {step === 1 ? (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>¿Qué perfil de riesgo tenés?</Text>
          <View style={styles.rowWrap}>
            {RISK_OPTIONS.map((risk) => (
              <Pressable
                key={risk}
                onPress={() => setState((prev) => ({ ...prev, riskProfile: risk }))}
                style={[
                  styles.pill,
                  { borderColor: palette.border, backgroundColor: palette.surfaceAlt },
                  state.riskProfile === risk ? [styles.pillActive, { borderColor: palette.primary }] : null
                ]}
              >
                <Text style={[styles.pillLabel, { color: palette.muted }, state.riskProfile === risk ? [styles.pillLabelActive, { color: palette.primary }] : null]}>{risk}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Sectores de interés</Text>
          <Text style={[styles.muted, { color: palette.muted }]}>Elegí al menos 1.</Text>
          <View style={styles.rowWrap}>
            {SECTOR_OPTIONS.map((sector) => {
              const selected = state.sectors.includes(sector);
              return (
                <Pressable
                  key={sector}
                  onPress={() => toggleSector(sector)}
                  style={[styles.pill, { borderColor: palette.border, backgroundColor: palette.surfaceAlt }, selected ? [styles.pillActive, { borderColor: palette.primary }] : null]}
                >
                  <Text style={[styles.pillLabel, { color: palette.muted }, selected ? [styles.pillLabelActive, { color: palette.primary }] : null]}>{sector}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Horizonte de inversión</Text>
          <View style={styles.rowWrap}>
            {HORIZON_OPTIONS.map((h) => (
              <Pressable
                key={h}
                onPress={() => setState((prev) => ({ ...prev, horizon: h }))}
                style={[styles.pill, { borderColor: palette.border, backgroundColor: palette.surfaceAlt }, state.horizon === h ? [styles.pillActive, { borderColor: palette.primary }] : null]}
              >
                <Text style={[styles.pillLabel, { color: palette.muted }, state.horizon === h ? [styles.pillLabelActive, { color: palette.primary }] : null]}>{h}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {step === 4 ? (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Notificaciones push</Text>
          <Text style={[styles.muted, { color: palette.muted }]}>Activá push nativo para alertas en tiempo real.</Text>
          <Pressable style={[styles.buttonSecondary, { backgroundColor: palette.secondaryButton }]} onPress={enablePush} disabled={pushLoading || state.pushEnabled}>
            <Text style={[styles.buttonSecondaryLabel, { color: palette.text }]}>{state.pushEnabled ? 'Push activo' : pushLoading ? 'Activando...' : 'Activar push nativo'}</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
      {message ? <Text style={[styles.message, { color: palette.info }]}>{message}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={[styles.buttonSecondary, { backgroundColor: palette.secondaryButton }]} disabled={step === 1 || saving} onPress={() => setStep((s) => Math.max(1, s - 1))}>
          <Text style={[styles.buttonSecondaryLabel, { color: palette.text }]}>Anterior</Text>
        </Pressable>

        {step < 4 ? (
          <Pressable style={[styles.buttonPrimary, { backgroundColor: palette.primary }, !canNext ? styles.buttonDisabled : null]} disabled={!canNext || saving} onPress={() => setStep((s) => Math.min(4, s + 1))}>
            <Text style={[styles.buttonPrimaryLabel, { color: palette.primaryText }]}>Siguiente</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.buttonPrimary, { backgroundColor: palette.primary }]} disabled={saving} onPress={finish}>
            <Text style={[styles.buttonPrimaryLabel, { color: palette.primaryText }]}>{saving ? 'Finalizando...' : 'Finalizar onboarding'}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { ...typography.screenTitle },
  muted: { ...typography.body, marginTop: 6 },
  progressTrack: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 999,
    height: 8,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999
  },
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  sectionTitle: { ...typography.sectionTitle, marginBottom: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  pillActive: {},
  pillLabel: { ...typography.chipLabel },
  pillLabelActive: {},
  actions: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  buttonPrimary: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonPrimaryLabel: { ...typography.buttonLabel },
  buttonSecondary: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonSecondaryLabel: { ...typography.buttonLabel },
  buttonDisabled: { opacity: 0.5 },
  error: { ...typography.body, marginTop: 10 },
  message: { ...typography.body, marginTop: 10 }
});

export default OnboardingScreen;
