import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';

const AlertsScreen = () => {
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getAlerts()
      .then((out) => {
        if (!active) return;
        setAlerts(out?.alerts || []);
      })
      .catch(() => {
        if (!active) return;
        setError('No se pudieron cargar alertas.');
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alertas</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.muted}>Sin alertas disponibles.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.symbol}>{item.symbol}</Text>
            <Text style={styles.meta}>
              {item.recommendation} • {item.type}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080F1E', padding: 16 },
  title: { color: '#E0E7F0', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  row: {
    backgroundColor: '#0F1A2E',
    borderColor: '#25324B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8
  },
  symbol: { color: '#E0E7F0', fontWeight: '700' },
  meta: { color: '#6B7B8D', marginTop: 2 },
  muted: { color: '#6B7B8D' },
  error: { color: '#FF6B6B', marginBottom: 10 }
});

export default AlertsScreen;
