import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

const STATUS_MAP = {
  New:       'new',
  Open:      'open',
  Qualified: 'qualified',
  Won:       'won',
  Lost:      'lost',
  Pending:   'pending',
};

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name = '') {
  const palette = ['#6366F1','#8B5CF6','#EC4899','#F97316','#22D3EE','#10B981'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

export default function LeadCard({ lead, onPress }) {
  const { colors } = useTheme();

  const status    = lead.status || lead.leadStatus || 'New';
  const badge     = colors.status[STATUS_MAP[status]] || colors.status.new;
  const name      = lead.name || lead.fullName || 'Unknown';
  const phone     = lead.phone || lead.mobile || '';
  const source    = lead.primarySource || lead.source || '';
  const assigned  = lead.assignedTo?.name || lead.assignedToName || '';
  const avatarBg  = getAvatarColor(name);

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
    name: { color: colors.text.primary, fontSize: typography.size.base, fontWeight: typography.weight.semibold, flex: 1 },
    meta: { color: colors.text.secondary, fontSize: typography.size.sm },
    tag: { color: colors.text.muted, fontSize: typography.size.xs },
    assigned: { color: colors.brand.light, fontSize: typography.size.xs },
    chevron: { color: colors.text.muted, fontSize: 22, marginLeft: 4 },
  });

  return (
    <TouchableOpacity onPress={onPress} style={themed.card} activeOpacity={0.75}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarBg + '30', borderColor: avatarBg + '60' }]}>
        <Text style={[styles.initials, { color: avatarBg }]}>{getInitials(name)}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={themed.name} numberOfLines={1}>{name}</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{status}</Text>
          </View>
        </View>

        {phone ? (
          <Text style={themed.meta}>📞 {phone}</Text>
        ) : null}

        <View style={styles.bottomRow}>
          {source ? <Text style={themed.tag}>🔗 {source}</Text> : null}
          {assigned ? <Text style={themed.assigned}>👤 {assigned}</Text> : null}
        </View>
      </View>

      <Text style={themed.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: spacing.radius.full,
  },
  badgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
});
