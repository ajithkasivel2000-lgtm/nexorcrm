import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

const STATUS_STYLE = {
  Active:     { bg: '#14281A', text: '#10B981' },
  Inactive:   { bg: '#2D1B1B', text: '#F87171' },
  Upcoming:   { bg: '#1C3349', text: '#60A5FA' },
  Completed:  { bg: '#1A2333', text: '#94A3B8' },
  OnHold:     { bg: '#2D2416', text: '#FBBF24' },
};

export default function ProjectCard({ project, onPress }) {
  const { colors } = useTheme();

  const name     = project.name || 'Unnamed Project';
  const location = project.location || project.city || '';
  const type     = project.projectType || project.type || '';
  const status   = project.status || project.projectStatus || 'Active';
  const badge    = STATUS_STYLE[status] || STATUS_STYLE.Active;
  const units    = project.totalUnits ?? project.unitCount ?? null;

  const themed = StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border.default,
      gap: spacing.sm,
    },
    iconWrap: {
      width: 44, height: 44, borderRadius: spacing.radius.sm,
      backgroundColor: colors.bg.tertiary,
      alignItems: 'center', justifyContent: 'center',
    },
    name: { color: colors.text.primary, fontSize: typography.size.base, fontWeight: typography.weight.semibold, flex: 1 },
    meta: { color: colors.text.muted, fontSize: typography.size.sm },
    chevron: { color: colors.text.muted, fontSize: 22 },
  });

  return (
    <TouchableOpacity onPress={onPress} style={themed.card} activeOpacity={0.75}>
      {/* Icon */}
      <View style={themed.iconWrap}>
        <Text style={styles.icon}>🏗️</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={themed.name} numberOfLines={1}>{name}</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{status}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          {location ? <Text style={themed.meta}>📍 {location}</Text> : null}
          {type     ? <Text style={themed.meta}>🏢 {type}</Text>     : null}
          {units != null ? <Text style={themed.meta}>🔑 {units} units</Text> : null}
        </View>
      </View>

      <Text style={themed.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 22 },
  content: { flex: 1, gap: 5 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: spacing.radius.full,
  },
  badgeText: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
