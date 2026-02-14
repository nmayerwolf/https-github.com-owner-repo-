import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { registerNativePush } from '../lib/push';
import { clearPushSubscriptionId, savePushSubscriptionId } from '../store/auth';
import { getThemePalette } from '../theme/palette';

const SettingsScreen = ({ onLogout, theme = 'dark', onThemeChange }) => {
  const palette = getThemePalette(theme);
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
      const validTime = (value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
      if (!validTime(prefs.quietHoursStart) || !validTime(prefs.quietHoursEnd)) {
        throw new Error('Quiet hours inválidas. Usá formato HH:MM (UTC).');
      }

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
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Settings</Text>
      <Text style={[styles.status, { color: palette.muted }]}>Push: {pushEnabled ? 'activo' : 'inactivo'}</Text>
      <Pressable style={[styles.button, { backgroundColor: palette.primary }]} disabled={loading} onPress={enablePush}>
        <Text style={[styles.buttonLabel, { color: palette.primaryText }]}>{loading ? 'Activando...' : 'Activar push nativo'}</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.secondary, { backgroundColor: palette.secondaryButton }]} disabled={loading || !pushEnabled} onPress={disablePush}>
        <Text style={[styles.secondaryLabel, { color: palette.text }]}>{loading ? 'Procesando...' : 'Desactivar push nativo'}</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.secondary, { backgroundColor: palette.secondaryButton }]} onPress={onLogout}>
        <Text style={[styles.secondaryLabel, { color: palette.text }]}>Cerrar sesión</Text>
      </Pressable>

      <Text style={[styles.section, { color: palette.text }]}>Tema</Text>
      <View style={styles.rowTwo}>
        <Pressable
          style={[styles.button, styles.themeButton, { backgroundColor: theme === 'dark' ? palette.primary : palette.secondaryButton }]}
          onPress={() => onThemeChange?.('dark')}
        >
          <Text style={[styles.buttonLabel, { color: theme === 'dark' ? palette.primaryText : palette.text }]}>Oscuro</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.themeButton, { backgroundColor: theme === 'light' ? palette.primary : palette.secondaryButton }]}
          onPress={() => onThemeChange?.('light')}
        >
          <Text style={[styles.buttonLabel, { color: theme === 'light' ? palette.primaryText : palette.text }]}>Claro</Text>
        </Pressable>
      </View>

      <Text style={[styles.section, { color: palette.text }]}>Preferencias de notificaciones</Text>
      {prefsLoading ? (
        <Text style={[styles.status, { color: palette.muted }]}>Cargando preferencias...</Text>
      ) : (
        <>
          <View style={[styles.prefRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.prefLabel, { color: palette.text }]}>Stop loss</Text>
            <Switch
              value={prefs.stopLoss}
              onValueChange={(value) => setPrefs((prev) => ({ ...prev, stopLoss: value }))}
              thumbColor={prefs.stopLoss ? palette.primary : palette.muted}
            />
          </View>

          <View style={[styles.prefRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.prefLabel, { color: palette.text }]}>Oportunidades</Text>
            <Switch
              value={prefs.opportunities}
              onValueChange={(value) => setPrefs((prev) => ({ ...prev, opportunities: value }))}
              thumbColor={prefs.opportunities ? palette.primary : palette.muted}
            />
          </View>

          <View style={[styles.prefRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.prefLabel, { color: palette.text }]}>Actividad de grupo</Text>
            <Switch
              value={prefs.groupActivity}
              onValueChange={(value) => setPrefs((prev) => ({ ...prev, groupActivity: value }))}
              thumbColor={prefs.groupActivity ? palette.primary : palette.muted}
            />
          </View>

          <Text style={[styles.prefHint, { color: palette.muted }]}>Quiet hours (UTC, HH:MM)</Text>
          <View style={styles.timeRow}>
            <TextInput
              placeholder="22:00"
              placeholderTextColor={palette.muted}
              value={prefs.quietHoursStart}
              onChangeText={(value) => setPrefs((prev) => ({ ...prev, quietHoursStart: value }))}
              style={[styles.timeInput, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
            />
            <Text style={[styles.prefLabel, { color: palette.text }]}>a</Text>
            <TextInput
              placeholder="07:00"
              placeholderTextColor={palette.muted}
              value={prefs.quietHoursEnd}
              onChangeText={(value) => setPrefs((prev) => ({ ...prev, quietHoursEnd: value }))}
              style={[styles.timeInput, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
            />
          </View>

          <Pressable style={[styles.button, styles.saveButton, { backgroundColor: palette.primary }]} disabled={prefsSaving} onPress={savePreferences}>
            <Text style={[styles.buttonLabel, { color: palette.primaryText }]}>{prefsSaving ? 'Guardando...' : 'Guardar preferencias'}</Text>
          </Pressable>
        </>
      )}

      {message ? <Text style={[styles.message, { color: palette.muted }]}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  status: { marginBottom: 8 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  rowTwo: { flexDirection: 'row', gap: 8 },
  button: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  buttonLabel: { fontWeight: '700' },
  secondary: {},
  secondaryLabel: { fontWeight: '600' },
  themeButton: { flex: 1 },
  saveButton: { marginTop: 8 },
  prefRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  prefLabel: {},
  prefHint: { marginTop: 6, marginBottom: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  message: { marginTop: 8 }
});

export default SettingsScreen;
