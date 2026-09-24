import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getLogs, deleteOldLogs, deleteAllLogs } from '../../services/logs';

const COLORS = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  brand: '#4F46E5', // Matches screenshot
  white: '#FFFFFF',
  danger: '#EF4444',
  success: '#22C55E'
};

const EVENT_TYPES = ['All', 'LOGIN', 'LOGIN_FAILED', 'LOGOFF', 'PASSWORD_CHANGED', 'PASSWORD_RESET'];

export default function LogsScreen() {
  const navigation = useNavigation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLogs();
      setLogs(data);
    } catch (e) {
      console.error('Error loading logs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteOldLogs = () => {
    Alert.alert('Delete Logs', 'Are you sure you want to delete logs older than 30 days?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOldLogs();
            load();
          } catch(e) {
            Alert.alert('Error', e.response?.data?.message || 'Failed to delete logs');
          }
        }
      }
    ]);
  };

  const handleDeleteAllLogs = () => {
    Alert.alert('Delete All Logs', 'Are you sure you want to delete ALL logs? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete All', 
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAllLogs();
            load();
          } catch(e) {
            Alert.alert('Error', e.response?.data?.message || 'Failed to delete logs');
          }
        }
      }
    ]);
  };

  const filteredLogs = logs.filter(log => {
    if (activeTab !== 'All' && log.event !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.username?.toLowerCase().includes(q) ||
        log.event?.toLowerCase().includes(q) ||
        log.ipAddress?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getEventStyle = (event) => {
    switch (event) {
      case 'LOGIN': return { color: COLORS.success, borderColor: COLORS.success };
      case 'LOGIN_FAILED': return { color: '#0EA5E9', borderColor: '#0EA5E9' }; // Sky blue like screenshot
      case 'LOGOFF': return { color: COLORS.textSecondary, borderColor: COLORS.textSecondary };
      default: return { color: COLORS.brand, borderColor: COLORS.brand };
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  const renderTab = (label) => {
    const isActive = activeTab === label;
    const count = label === 'All' ? logs.length : logs.filter(l => l.event === label).length;
    
    return (
      <TouchableOpacity 
        key={label}
        style={[styles.tabBtn, isActive && styles.tabBtnActive]}
        onPress={() => setActiveTab(label)}
      >
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
        <View style={styles.tabCount}>
          <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Feather name="file-text" size={48} color={COLORS.textMuted} style={{ marginBottom: 16 }} />
      <Text style={styles.emptyTitle}>No logs found</Text>
      <Text style={styles.emptySubtitle}>Try adjusting your filters.</Text>
    </View>
  );

  const renderItem = ({ item, index }) => {
    const badgeStyle = getEventStyle(item.event);
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Text style={styles.itemNumber}>{index + 1}.</Text>
            <Text style={styles.itemUsername}>{item.username}</Text>
          </View>
          <View style={[styles.eventBadge, { borderColor: badgeStyle.borderColor }]}>
            <View style={[styles.eventDot, { backgroundColor: badgeStyle.color }]} />
            <Text style={[styles.eventText, { color: badgeStyle.color }]}>{item.event}</Text>
          </View>
        </View>
        
        <View style={styles.cardBody}>
          <View style={styles.detailRow}>
            <Feather name="calendar" size={14} color={COLORS.textMuted} />
            <Text style={styles.detailText}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Feather name="map-pin" size={14} color={COLORS.textMuted} />
            <Text style={styles.detailText}>{item.ipAddress}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <Feather name="menu" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.headerTitle}>Logs</Text>
            <Text style={styles.headerSubtitle}>Sign-in activity recorded across the system.</Text>
          </View>
        </View>
      </View>
      
      {/* Actions */}
      <View style={styles.actionHeader}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleDeleteOldLogs}>
            <Feather name="trash-2" size={14} color={COLORS.textSecondary} />
            <Text style={styles.actionBtnText}>Delete logs older than 30 days</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: COLORS.danger }]} onPress={handleDeleteAllLogs}>
            <Feather name="trash" size={14} color={COLORS.danger} />
            <Text style={[styles.actionBtnText, { color: COLORS.danger }]}>Delete all logs</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
          {EVENT_TYPES.map(renderTab)}
        </ScrollView>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search username, event or IP..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Feather name="filter" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.brand} />
        </View>
      ) : (
        <FlatList 
          data={filteredLogs}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          ListEmptyComponent={renderEmptyComponent}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === 'android' ? 30 : 0
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  actionHeader: {
    flexDirection: 'row',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    gap: 6,
    backgroundColor: COLORS.white,
  },
  actionBtnText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tabsContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabBtnActive: {
    borderBottomColor: COLORS.brand,
  },
  tabText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.brand,
    fontWeight: '600',
  },
  tabCount: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabCountText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  tabCountTextActive: {
    color: COLORS.brand,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 8,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingLeft: 36,
    paddingRight: 12,
    color: COLORS.textPrimary,
    fontSize: 13,
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  list: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemNumber: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  itemUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventText: {
    fontSize: 10,
    fontWeight: '600',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.bg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  }
});
