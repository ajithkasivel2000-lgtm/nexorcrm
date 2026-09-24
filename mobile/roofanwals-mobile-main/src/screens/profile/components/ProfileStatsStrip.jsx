import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

export default function ProfileStatsStrip({ overview, user }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const blocks = [
    { icon: 'briefcase', label: 'Department', value: overview?.department?.name || '—' },
    { icon: 'award', label: 'Designation', value: user?.designation || '—' },
    { icon: 'users', label: 'Direct Reports', value: overview?.directReports || 0 },
    { icon: 'monitor', label: 'Active Sessions', value: overview?.activeSessions || 0 },
    { icon: 'log-in', label: 'Login Count', value: `${overview?.loginCount || 0} successful` },
    { icon: 'calendar', label: 'Account Age', value: `${overview?.accountAgeDays || 0} days` },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {blocks.map((b, idx) => (
        <View key={idx} style={styles.block}>
          <View style={styles.iconRow}>
            <Feather name={b.icon} size={14} color="#64748B" />
            <Text style={styles.label}>{b.label}</Text>
          </View>
          <Text style={styles.value}>{b.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  block: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    padding: 12,
    minWidth: 140,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    color: colors.text.muted,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  }
});
