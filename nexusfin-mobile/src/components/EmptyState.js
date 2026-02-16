import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { typography } from '../theme/typography';
import FadeInView from './FadeInView';

const EmptyState = ({ title = 'Sin datos', subtitle = '', palette }) => {
  return (
    <FadeInView delay={60}>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
      </View>
    </FadeInView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8
  },
  title: { ...typography.bodyStrong },
  subtitle: { ...typography.body, marginTop: 4 }
});

export default EmptyState;
