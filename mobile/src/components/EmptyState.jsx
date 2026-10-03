import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

export default function EmptyState({ icon = '📋', title = 'No results', subtitle = '' }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    title: { color: colors.text.secondary, fontSize: typography.size.lg, fontWeight: typography.weight.semibold, textAlign: 'center' },
    subtitle: { color: colors.text.muted, fontSize: typography.size.sm, textAlign: 'center', maxWidth: 240 },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={themed.title}>{title}</Text>
      {subtitle ? <Text style={themed.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: spacing.sm,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
});
