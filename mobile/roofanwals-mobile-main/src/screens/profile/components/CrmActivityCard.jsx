import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

export default function CrmActivityCard({ stats }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  if (!stats) return null;

  const items = [
    { label: 'Leads', value: stats.leads },
    { label: 'Opportunities', value: stats.opportunities },
    { label: 'Open Tasks', value: stats.openTasks },
    { label: 'Overdue', value: stats.overdueTasks, highlight: true },
    { label: 'Completed', value: stats.completedTasks },
    { label: 'Activities', value: stats.activities },
    { label: 'Channel Partners', value: stats.channelPartners },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="activity" size={16} color="#8B5CF6" />
        <Text style={styles.title}>CRM Activity</Text>
      </View>
      <View style={styles.grid}>
        {items.map((item, idx) => (
          <View key={idx} style={styles.gridItem}>
            <Text style={styles.label}>{item.label}</Text>
            <View style={item.highlight && item.value > 0 ? styles.highlightWrap : null}>
              <Text style={[styles.value, item.highlight && item.value > 0 && styles.highlightText]}>
                {item.value || 0}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.bg.secondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: '#F8FAFC',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '50%',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  label: {
    fontSize: 10,
    color: colors.text.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  highlightWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  highlightText: {
    color: '#DC2626',
    fontSize: 14,
  }
});
