import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

function fmt(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch (_) { return ''; }
}

/** Recent activity — the lead-log feed from the web dashboard. */
export default function ActivityFeed({ items = [] }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    line: { backgroundColor: colors.border.default },
    dot: { backgroundColor: colors.brand.primary },
    title: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    subtitle: { color: colors.text.secondary, fontSize: typography.size.xs, marginTop: 2 },
    date: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 3 },
    empty: { color: colors.text.muted, fontSize: typography.size.sm, textAlign: 'center', paddingVertical: 8 },
  });

  if (!items.length) {
    return <Text style={themed.empty}>No recent activity</Text>;
  }

  return (
    <View style={styles.wrap}>
      {items.map((item, i) => (
        <View key={item.id || i} style={styles.row}>
          <View style={styles.dotColumn}>
            <View style={[styles.dot, themed.dot]} />
            {i < items.length - 1 ? <View style={[styles.line, themed.line]} /> : null}
          </View>
          <View style={styles.content}>
            <Text style={themed.title}>{item.title || 'Update'}</Text>
            {item.subtitle ? (
              <Text style={themed.subtitle}>{item.subtitle}</Text>
            ) : null}
            <Text style={themed.date}>{fmt(item.date)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', gap: 10 },
  dotColumn: { alignItems: 'center', width: 14 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    marginTop: 5,
  },
  line: {
    width: 2, flex: 1,
    marginVertical: 2,
  },
  content: {
    flex: 1,
    paddingBottom: spacing.md,
  },
});
