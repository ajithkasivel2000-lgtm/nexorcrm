import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';

/**
 * Rows of "name — bar — count · pct", the mobile twin of the web
 * pipeline/status/owner breakdown panels (Opportunity pipeline, Lead status,
 * Projects, Lead owners).
 */
export default function ProgressBarList({ data = [], emptyText = 'Nothing recorded yet', color = '#3987E5' }) {
  const { colors } = useTheme();
  const total = data.reduce((s, d) => s + d.value, 0);

  const themed = StyleSheet.create({
    name: { width: 96, color: colors.text.secondary, fontSize: typography.size.xs },
    barWrap: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.bg.tertiary,
      overflow: 'hidden',
    },
    meta: {
      width: 62,
      textAlign: 'right',
      color: colors.text.primary,
      fontSize: typography.size.xs,
      fontWeight: '600',
    },
    empty: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
      textAlign: 'center',
      paddingVertical: 8,
    },
  });

  if (!total) {
    return <Text style={themed.empty}>{emptyText}</Text>;
  }

  return (
    <View style={styles.wrap}>
      {data.slice(0, 6).map((d, i) => {
        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
        return (
          <View key={`${d.name}-${i}`} style={styles.row}>
            <Text style={themed.name} numberOfLines={1}>{d.name}</Text>
            <View style={themed.barWrap}>
              <View style={[styles.bar, { width: `${Math.max(pct, 2)}%`, backgroundColor: color }]} />
            </View>
            <Text style={themed.meta}>{d.value} · {pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bar: {
    height: '100%',
    borderRadius: 4,
  },
});
