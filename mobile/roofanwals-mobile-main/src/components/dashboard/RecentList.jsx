import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return ''; }
}

/** Mini list used for Recent leads / Recent opportunities panels. */
export default function RecentList({ items = [], kind = 'lead', onPressItem, emptyText }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    row: {
      backgroundColor: colors.bg.tertiary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    iconWrap: { backgroundColor: colors.brand.primary + '20' },
    name: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    meta: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
    badge: {
      backgroundColor: colors.bg.secondary,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    badgeText: { color: colors.text.secondary, fontSize: typography.size.xs },
    empty: { color: colors.text.muted, fontSize: typography.size.sm, textAlign: 'center', paddingVertical: 8 },
  });

  if (!items.length) {
    return <Text style={themed.empty}>{emptyText || 'Nothing yet'}</Text>;
  }

  return (
    <View style={styles.wrap}>
      {items.map((item, i) => {
        const isOpp = kind === 'opportunity';
        const name = isOpp ? (item.opportunityName || item.name || 'Untitled') : (item.name || item.fullName || 'Unknown');
        const code = isOpp ? item.oppId : item.mobile;
        const badge = isOpp ? (item.stage || '') : (item.status || '');
        const meta = isOpp ? (item.LeadsProject || '') : (item.primarySource || '');

        return (
          <TouchableOpacity
            key={item.id || i}
            style={[styles.row, themed.row]}
            activeOpacity={0.75}
            onPress={onPressItem ? () => onPressItem(item) : undefined}
          >
            <View style={[styles.iconWrap, themed.iconWrap]}>
              <Feather name={isOpp ? 'briefcase' : 'user'} size={13} color={colors.brand.light} />
            </View>
            <View style={styles.content}>
              <Text style={themed.name} numberOfLines={1}>{name}</Text>
              <Text style={themed.meta} numberOfLines={1}>
                {[fmtDate(item.createdAt), code, meta].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {badge ? (
              <View style={[styles.badge, themed.badge]}>
                <Text style={themed.badgeText} numberOfLines={1}>{badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: 110,
  },
});
