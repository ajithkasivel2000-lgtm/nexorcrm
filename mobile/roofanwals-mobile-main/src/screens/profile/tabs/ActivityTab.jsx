import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getUserAuditLogs } from '../../../services/users';

const FILTERS = ['All', 'LOGIN', 'LOGIN_FAILED', 'LOGOFF'];

export default function ActivityTab({ user }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    loadLogs();
  }, [user.id, activeFilter]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const actionParam = activeFilter === 'All' ? null : activeFilter;
      const data = await getUserAuditLogs(user.id, actionParam);
      // Backend returns { items, total, page, pages }
      setLogs(data?.items || []);
    } catch (e) {
      console.log('Error loading logs:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getIconData = (action) => {
    switch (action) {
      case 'LOGIN':
        return { name: 'user-check', color: '#22C55E' };
      case 'LOGIN_FAILED':
        return { name: 'alert-circle', color: '#EF4444' };
      case 'LOGOFF':
        return { name: 'log-out', color: '#6366F1' }; // Indigo for logoff
      default:
        return { name: 'activity', color: colors.text.muted };
    }
  };

  const renderLog = ({ item }) => {
    const iconData = getIconData(item.action);
    
    return (
      <View style={styles.logRow}>
        <View style={styles.iconWrap}>
          <Feather name={iconData.name} size={16} color={iconData.color} />
        </View>
        <View style={styles.infoWrap}>
          <Text style={styles.actionText}>{item.action.replace('_', ' ')}</Text>
          <Text style={styles.ipText}>IP {item.ipAddress || 'Unknown'}</Text>
        </View>
        <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.primary }]}>
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Feather name="clock" size={16} color="#4F46E5" />
            <Text style={styles.title}>Login & Security History</Text>
          </View>
          <View style={styles.filtersWrap}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                  {f.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No activity records found.</Text>
          </View>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={item => item.id.toString()}
            renderItem={renderLog}
            scrollEnabled={false}
          />
        )}
      </View>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  loaderWrap: {
    padding: 32,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'column', // Stacked on mobile to fit filters
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.bg.secondary,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  filtersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.bg.tertiary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  filterPillActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#22C55E',
  },
  filterText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.text.muted,
  },
  filterTextActive: {
    color: '#166534',
  },
  logRow: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 24,
    alignItems: 'center',
    marginTop: 2,
  },
  infoWrap: {
    flex: 1,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  ipText: {
    fontSize: 11,
    color: colors.text.muted,
  },
  dateText: {
    fontSize: 11,
    color: colors.text.muted,
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
  }
});
