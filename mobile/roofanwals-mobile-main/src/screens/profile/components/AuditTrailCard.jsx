import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

export default function AuditTrailCard() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  
  // Note: The /overview API doesn't seem to return the full list of system logs,
  // just the counts. The web app fetches a separate audit trail or uses a mock for this overview.
  // We will show a placeholder representing recent logins to match the layout.

  const dummyLogs = [
    { text: 'Signed in - by admin', date: 'Just now' },
    { text: 'Signed in - by admin', date: '2 hours ago' },
    { text: 'Signed in - by admin', date: '1 day ago' },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="file-text" size={16} color="#3B82F6" />
        <Text style={styles.title}>Audit Trail</Text>
      </View>
      
      <View style={styles.list}>
        {dummyLogs.map((log, idx) => (
          <View key={idx} style={styles.row}>
            <View style={styles.iconWrap}>
              <Feather name="user-check" size={14} color="#10B981" />
            </View>
            <Text style={styles.logText}>{log.text}</Text>
            <Text style={styles.dateText}>{log.date}</Text>
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
  list: {
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    gap: 12,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 11,
    color: colors.text.muted,
  }
});
