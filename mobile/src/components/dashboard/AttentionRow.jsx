import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const ITEMS = [
  { key: 'followUpsOverdue', label: 'Follow-ups overdue', icon: 'alert-circle', danger: true },
  { key: 'followUpsToday', label: 'Due today', icon: 'clock' },
  { key: 'followUpsThisWeek', label: 'Due this week', icon: 'calendar' },
  { key: 'siteVisitsUpcoming', label: 'Site visits ahead', icon: 'map-pin' },
  { key: 'siteVisitsCompleted', label: 'Site visits done', icon: 'check-circle' },
];

/** "What needs attention" — follow-up and site-visit counts. */
export default function AttentionRow({ workload = {} }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    tile: {
      flex: 1,
      minWidth: '30%',
      backgroundColor: colors.bg.tertiary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: spacing.sm,
      alignItems: 'flex-start',
      gap: 4,
    },
    tileDanger: { borderColor: '#7F1D1D' },
    value: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
    label: { color: colors.text.muted, fontSize: typography.size.xs },
  });

  return (
    <View style={styles.wrap}>
      {ITEMS.map((it) => {
        const value = workload[it.key] ?? 0;
        const danger = it.danger && value > 0;
        return (
          <View key={it.key} style={[themed.tile, danger && themed.tileDanger]}>
            <Feather
              name={it.icon}
              size={14}
              color={danger ? '#F87171' : colors.text.muted}
            />
            <Text style={[themed.value, danger && { color: '#F87171' }]}>{value}</Text>
            <Text style={themed.label} numberOfLines={2}>{it.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
