import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { registerNativePush } from '../lib/push';

const RISK_OPTIONS = ['conservador', 'moderado', 'agresivo'];
const HORIZON_OPTIONS = ['corto', 'mediano', 'largo'];
const SECTOR_OPTIONS = ['tech', 'finance', 'health', 'energy', 'auto', 'crypto', 'metals', 'bonds', 'fx'];

const OnboardingScreen = ({ onDone }) => {
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
        <Text style={styles.title}>Onboarding</Text>
        <Text style={styles.muted}>Cargando preferencias...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>Onboarding guiado</Text>
      <Text style={styles.muted}>Paso {step}/4</Text>

      {step === 1 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>¿Qué perfil de riesgo tenés?</Text>
          <View style={styles.rowWrap}>
            {RISK_OPTIONS.map((risk) => (
              <Pressable
                key={risk}
                onPress={() => setState((prev) => ({ ...prev, riskProfile: risk }))}
                style={[styles.pill, state.riskProfile === risk ? styles.pillActive : null]}
              >
                <Text style={[styles.pillLabel, state.riskProfile === risk ? styles.pillLabelActive : null]}>{risk}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sectores de interés</Text>
          <Text style={styles.muted}>Elegí al menos 1.</Text>
          <View style={styles.rowWrap}>
            {SECTOR_OPTIONS.map((sector) => {
              const selected = state.sectors.includes(sector);
              return (
                <Pressable key={sector} onPress={() => toggleSector(sector)} style={[styles.pill, selected ? styles.pillActive : null]}>
                  <Text style={[styles.pillLabel, selected ? styles.pillLabelActive : null]}>{sector}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Horizonte de inversión</Text>
          <View style={styles.rowWrap}>
            {HORIZON_OPTIONS.map((h) => (
              <Pressable key={h} onPress={() => setState((prev) => ({ ...prev, horizon: h }))} style={[styles.pill, state.horizon === h ? styles.pillActive : null]}>
                <Text style={[styles.pillLabel, state.horizon === h ? styles.pillLabelActive : null]}>{h}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {step === 4 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notificaciones push</Text>
          <Text style={styles.muted}>Activá push nativo para alertas en tiempo real.</Text>
          <Pressable style={styles.buttonSecondary} onPress={enablePush} disabled={pushLoading || state.pushEnabled}>
            <Text style={styles.buttonSecondaryLabel}>{state.pushEnabled ? 'Push activo' : pushLoading ? 'Activando...' : 'Activar push nativo'}</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.buttonSecondary} disabled={step === 1 || saving} onPress={() => setStep((s) => Math.max(1, s - 1))}>
          <Text style={styles.buttonSecondaryLabel}>Anterior</Text>
        </Pressable>

        {step < 4 ? (
          <Pressable style={[styles.buttonPrimary, !canNext ? styles.buttonDisabled : null]} disabled={!canNext || saving} onPress={() => setStep((s) => Math.min(4, s + 1))}>
            <Text style={styles.buttonPrimaryLabel}>Siguiente</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.buttonPrimary} disabled={saving} onPress={finish}>
            <Text style={styles.buttonPrimaryLabel}>{saving ? 'Finalizando...' : 'Finalizar onboarding'}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080F1E', padding: 16 },
  title: { color: '#E0E7F0', fontSize: 24, fontWeight: '700' },
  muted: { color: '#6B7B8D', marginTop: 6 },
  card: {
    marginTop: 12,
    backgroundColor: '#0F1A2E',
    borderColor: '#25324B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  sectionTitle: { color: '#E0E7F0', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderRadius: 999,
    borderColor: '#25324B',
    borderWidth: 1,
    backgroundColor: '#15243B',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  pillActive: { borderColor: '#00E08E', backgroundColor: '#0B2A21' },
  pillLabel: { color: '#6B7B8D', fontWeight: '700' },
  pillLabelActive: { color: '#00E08E' },
  actions: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  buttonPrimary: {
    flex: 1,
    backgroundColor: '#00E08E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonPrimaryLabel: { color: '#02130D', fontWeight: '700' },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#182740',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonSecondaryLabel: { color: '#E0E7F0', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  error: { color: '#FF6B6B', marginTop: 10 },
  message: { color: '#60A5FA', marginTop: 10 }
});

export default OnboardingScreen;
