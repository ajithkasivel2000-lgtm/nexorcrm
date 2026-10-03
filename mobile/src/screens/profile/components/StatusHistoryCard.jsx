import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

export default function StatusHistoryCard({ history }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="clock" size={16} color="#8B5CF6" />
        <Text style={styles.title}>Status History</Text>
      </View>
      
      <View style={styles.content}>
        {history ? (
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Feather name="refresh-ccw" size={14} color="#3B82F6" />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.statusText}>
                Status changed to <Text style={styles.bold}>{history.status}</Text>
              </Text>
              <Text style={styles.dateText}>
                {new Date(history.changedAt).toLocaleString()}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <Feather name="link-2" size={24} color="#CBD5E1" style={styles.emptyIcon} />
            <Text style={styles.emptyText}>No status changes yet</Text>
          </View>
        )}
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
    marginBottom: 32,
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
  content: {
    minHeight: 120,
    justifyContent: 'center',
    padding: 16,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyIcon: {
    marginBottom: 8,
    transform: [{ rotate: '45deg' }]
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  bold: {
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  }
});
