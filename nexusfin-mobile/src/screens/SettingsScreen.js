import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { registerNativePush } from '../lib/push';
import { clearPushSubscriptionId, savePushSubscriptionId } from '../store/auth';

const SettingsScreen = ({ onLogout }) => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSubIds, setPushSubIds] = useState([]);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    stopLoss: true,
    opportunities: true,
    groupActivity: true,
    quietHoursStart: '',
    quietHoursEnd: ''
  });

  useEffect(() => {
    let active = true;
    api
      .getPushSubscriptions()
      .then((out) => {
        if (!active) return;
        const mobile = (out?.subscriptions || []).filter((s) => s.platform === 'ios' || s.platform === 'android');
        setPushSubIds(mobile.map((s) => s.id));
        setPushEnabled(mobile.length > 0);
      })
      .catch(() => {
        if (!active) return;
        setPushSubIds([]);
        setPushEnabled(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setPrefsLoading(true);
    api
      .getNotificationPreferences()
      .then((out) => {
        if (!active) return;
        setPrefs({
          stopLoss: out?.stopLoss !== false,
          opportunities: out?.opportunities !== false,
          groupActivity: out?.groupActivity !== false,
          quietHoursStart: out?.quietHoursStart || '',
          quietHoursEnd: out?.quietHoursEnd || ''
        });
      })
      .catch(() => {
        if (!active) return;
      })
      .finally(() => {
        if (active) setPrefsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const enablePush = async () => {
    setLoading(true);
    setMessage('');
    try {
      const out = await registerNativePush();
      const sub = await api.subscribePush(out);
      await savePushSubscriptionId(sub?.id);
      setPushSubIds(sub?.id ? [sub.id] : []);
      setPushEnabled(true);
      setMessage('Push nativo activado.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo activar push nativo.');
    } finally {
      setLoading(false);
    }
  };

  const disablePush = async () => {
    setLoading(true);
    setMessage('');
    try {
      const ids = pushSubIds.length ? pushSubIds : [];
      for (const id of ids) {
        await api.deletePushSubscription(id);
      }
      await clearPushSubscriptionId();
      setPushSubIds([]);
      setPushEnabled(false);
      setMessage('Push nativo desactivado.');
    } catch (error) {
      setMessage(error?.message || 'No se pudo desactivar push nativo.');
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setPrefsSaving(true);
    setMessage('');
    try {
      const out = await api.updateNotificationPreferences({
        stopLoss: prefs.stopLoss,
        opportunities: prefs.opportunities,
        groupActivity: prefs.groupActivity,
        quietHoursStart: prefs.quietHoursStart || null,
        quietHoursEnd: prefs.quietHoursEnd || null
      });
      setPrefs({
        stopLoss: out?.stopLoss !== false,
        opportunities: out?.opportunities !== false,
        groupActivity: out?.groupActivity !== false,
        quietHoursStart: out?.quietHoursStart || '',
        quietHoursEnd: out?.quietHoursEnd || ''
      });
      setMessage('Preferencias guardadas.');
    } catch (error) {
      setMessage(error?.message || 'No se pudieron guardar preferencias.');
    } finally {
      setPrefsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.status}>Push: {pushEnabled ? 'activo' : 'inactivo'}</Text>
      <Pressable style={styles.button} disabled={loading} onPress={enablePush}>
        <Text style={styles.buttonLabel}>{loading ? 'Activando...' : 'Activar push nativo'}</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.secondary]} disabled={loading || !pushEnabled} onPress={disablePush}>
        <Text style={styles.secondaryLabel}>{loading ? 'Procesando...' : 'Desactivar push nativo'}</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.secondary]} onPress={onLogout}>
        <Text style={styles.secondaryLabel}>Cerrar sesión</Text>
      </Pressable>

      <Text style={styles.section}>Preferencias de notificaciones</Text>
      {prefsLoading ? (
        <Text style={styles.status}>Cargando preferencias...</Text>
      ) : (
        <>
          <View style={styles.prefRow}>
            <Text style={styles.prefLabel}>Stop loss</Text>
            <Switch
              value={prefs.stopLoss}
              onValueChange={(value) => setPrefs((prev) => ({ ...prev, stopLoss: value }))}
              thumbColor={prefs.stopLoss ? '#00E08E' : '#6B7B8D'}
            />
          </View>

          <View style={styles.prefRow}>
            <Text style={styles.prefLabel}>Oportunidades</Text>
            <Switch
              value={prefs.opportunities}
              onValueChange={(value) => setPrefs((prev) => ({ ...prev, opportunities: value }))}
              thumbColor={prefs.opportunities ? '#00E08E' : '#6B7B8D'}
            />
          </View>

          <View style={styles.prefRow}>
            <Text style={styles.prefLabel}>Actividad de grupo</Text>
            <Switch
              value={prefs.groupActivity}
              onValueChange={(value) => setPrefs((prev) => ({ ...prev, groupActivity: value }))}
              thumbColor={prefs.groupActivity ? '#00E08E' : '#6B7B8D'}
            />
          </View>

          <Text style={styles.prefHint}>Quiet hours (UTC, HH:MM)</Text>
          <View style={styles.timeRow}>
            <TextInput
              placeholder="22:00"
              placeholderTextColor="#6B7B8D"
              value={prefs.quietHoursStart}
              onChangeText={(value) => setPrefs((prev) => ({ ...prev, quietHoursStart: value }))}
              style={styles.timeInput}
            />
            <Text style={styles.prefLabel}>a</Text>
            <TextInput
              placeholder="07:00"
              placeholderTextColor="#6B7B8D"
              value={prefs.quietHoursEnd}
              onChangeText={(value) => setPrefs((prev) => ({ ...prev, quietHoursEnd: value }))}
              style={styles.timeInput}
            />
          </View>

          <Pressable style={[styles.button, styles.saveButton]} disabled={prefsSaving} onPress={savePreferences}>
            <Text style={styles.buttonLabel}>{prefsSaving ? 'Guardando...' : 'Guardar preferencias'}</Text>
          </Pressable>
        </>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080F1E', padding: 16 },
  title: { color: '#E0E7F0', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  status: { color: '#6B7B8D', marginBottom: 8 },
  section: { color: '#E0E7F0', fontSize: 16, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  button: {
    backgroundColor: '#00E08E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  buttonLabel: { color: '#02130D', fontWeight: '700' },
  secondary: { backgroundColor: '#182740' },
  secondaryLabel: { color: '#E0E7F0', fontWeight: '600' },
  saveButton: { marginTop: 8 },
  prefRow: {
    backgroundColor: '#0F1A2E',
    borderColor: '#25324B',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  prefLabel: { color: '#E0E7F0' },
  prefHint: { color: '#6B7B8D', marginTop: 6, marginBottom: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: {
    flex: 1,
    backgroundColor: '#0F1A2E',
    borderColor: '#25324B',
    borderWidth: 1,
    borderRadius: 10,
    color: '#E0E7F0',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  message: { color: '#6B7B8D', marginTop: 8 }
});

export default SettingsScreen;
