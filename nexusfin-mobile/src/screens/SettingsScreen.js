import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { registerNativePush } from '../lib/push';
import { clearPushSubscriptionId, savePushSubscriptionId } from '../store/auth';

const SettingsScreen = ({ onLogout }) => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSubIds, setPushSubIds] = useState([]);

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

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080F1E', padding: 16 },
  title: { color: '#E0E7F0', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  status: { color: '#6B7B8D', marginBottom: 8 },
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
  message: { color: '#6B7B8D', marginTop: 8 }
});

export default SettingsScreen;
