import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

/** A titled panel — the mobile twin of the web dashboard's Panel. */
export default function DashPanel({ icon, title, subtitle, actionLabel, onAction, children, style }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    panel: {
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    head: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
    },
    title: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
    subtitle: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 1 },
    action: { color: colors.brand.light, fontSize: typography.size.xs, fontWeight: '600' },
  });

  return (
    <View style={[themed.panel, style]}>
      <View style={[styles.head, themed.head]}>
        {icon ? (
          <View style={[styles.iconWrap, { backgroundColor: colors.brand.primary + '20' }]}>
            <Feather name={icon} size={14} color={colors.brand.light} />
          </View>
        ) : null}
        <View style={styles.titles}>
          <Text style={themed.title}>{title}</Text>
          {subtitle ? <Text style={themed.subtitle}>{subtitle}</Text> : null}
        </View>
        {actionLabel ? (
          <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={themed.action}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1 },
  body: { padding: spacing.md },
});
