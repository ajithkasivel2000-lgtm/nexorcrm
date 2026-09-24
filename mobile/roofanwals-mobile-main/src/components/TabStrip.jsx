import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

/**
 * Web-style tab strip with counts — the mobile twin of the DataTable tabs
 * (All Leads 0 · Our Leads 0 · Duplicate Leads 0 …).
 */
export default function TabStrip({ tabs = [], activeTab, onChange }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    wrap: {
      backgroundColor: colors.bg.secondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
      paddingHorizontal: spacing.sm,
    },
    tab: {
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    tabInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    tabInnerActive: { backgroundColor: colors.brand.primary + '1A', borderWidth: 1, borderColor: colors.brand.primary + '55' },
    label: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: '500' },
    labelActive: { color: colors.brand.primary, fontWeight: '600' },
    count: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
      backgroundColor: colors.bg.tertiary,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
      overflow: 'hidden',
      minWidth: 20,
      textAlign: 'center',
    },
    countActive: {
      color: colors.brand.primary,
      backgroundColor: colors.brand.primary + '22',
    },
  });

  return (
    <View style={themed.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <TouchableOpacity
              key={tab.id}
              style={themed.tab}
              activeOpacity={0.7}
              onPress={() => onChange(tab.id)}
            >
              <View style={[themed.tabInner, active && themed.tabInnerActive]}>
                <Text style={[themed.label, active && themed.labelActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
                <Text style={[themed.count, active && themed.countActive]}>{tab.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
