import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

const STAGE_COLORS = {
  Prospecting:    '#6366F1',
  Qualification:  '#8B5CF6',
  Proposal:       '#F59E0B',
  Negotiation:    '#F97316',
  'Closed Won':   '#10B981',
  'Closed Lost':  '#EF4444',
};

function formatCurrency(val) {
  if (!val) return '—';
  const n = Number(val);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toLocaleString()}`;
}

export default function OpportunityCard({ opportunity, onPress }) {
  const { colors } = useTheme();

  const stage   = opportunity.stage || opportunity.currentStage || 'Prospecting';
  const color   = STAGE_COLORS[stage] || colors.brand.primary;
  const name    = opportunity.name || opportunity.title || 'Untitled';
  const value   = opportunity.value || opportunity.dealValue || 0;
  const contact = opportunity.contactName || opportunity.contact?.name || '';
  const close   = opportunity.closeDate || opportunity.expectedCloseDate;

  const themed = StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
    },
    name: { color: colors.text.primary, fontSize: typography.size.base, fontWeight: typography.weight.semibold, flex: 1 },
    meta: { color: colors.text.muted, fontSize: typography.size.sm },
    chevron: { color: colors.text.muted, fontSize: 22, paddingRight: spacing.sm },
  });

  return (
    <TouchableOpacity onPress={onPress} style={themed.card} activeOpacity={0.75}>
      {/* Stage bar */}
      <View style={[styles.stageBar, { backgroundColor: color }]} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={themed.name} numberOfLines={1}>{name}</Text>
          <Text style={[styles.value, { color }]}>{formatCurrency(value)}</Text>
        </View>

        <View style={[styles.stageBadge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
          <Text style={[styles.stageText, { color }]}>{stage}</Text>
        </View>

        <View style={styles.bottomRow}>
          {contact ? <Text style={themed.meta}>👤 {contact}</Text> : null}
          {close ? (
            <Text style={themed.meta}>
              📅 {new Date(close).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={themed.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  stageBar: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, padding: spacing.md, gap: 6 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  value: { fontSize: typography.size.md, fontWeight: typography.weight.bold },
  stageBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: spacing.radius.full,
    borderWidth: 1,
  },
  stageText: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold },
  bottomRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
});
