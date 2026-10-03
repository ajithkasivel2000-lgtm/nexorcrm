import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { projectsService } from '../../services/projects';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

export default function ProjectsScreen({ navigation }) {
  const { colors } = useTheme();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  const loadData = useCallback(async () => {
    try {
      const res = await projectsService.getProjects();
      const rows = Array.isArray(res) ? res : (res?.projects || res?.data || []);
      setData(rows || []);
    } catch (e) {
      console.error('Failed to load Projects:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Derive tabs from projectStatus. Fallback to 'Unknown' if empty.
  const tabs = ['All', ...new Set(data.map(item => item.projectStatus || item.status).filter(Boolean))];

  const filtered = data.filter(item => {
    const status = item.projectStatus || item.status;
    if (activeTab !== 'All' && status !== activeTab) return false;
    
    const q = search.toLowerCase();
    if (!q) return true;
    
    return (
      (item.projectName || item.name || '').toLowerCase().includes(q) ||
      (item.city || item.location || '').toLowerCase().includes(q) ||
      (item.projectType || item.type || '').toLowerCase().includes(q)
    );
  });

  const themed = StyleSheet.create({
    root:   { flex: 1, backgroundColor: colors.bg.primary },
    header: {
      paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
      backgroundColor: colors.bg.secondary,
      borderBottomWidth: 1, borderBottomColor: colors.border.default,
    },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title:  { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    createBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.brand.primary + '14',
      borderWidth: 1, borderColor: colors.brand.primary + '33',
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: spacing.radius.md,
    },
    createBtnText: { color: colors.brand.primary, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
    subtitle: { color: colors.text.muted, fontSize: typography.size.sm },
    
    tabsWrap: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
    tabBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
      borderWidth: 1, borderColor: colors.border.default,
      backgroundColor: colors.bg.primary,
    },
    tabBtnActive: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primary + '14' },
    tabText: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
    tabTextActive: { color: colors.brand.primary, fontWeight: typography.weight.bold },
    badge: { backgroundColor: colors.bg.tertiary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { color: colors.text.muted, fontSize: 10, fontWeight: '600' },
    
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    searchWrap: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1, borderColor: colors.border.default,
      borderRadius: spacing.radius.md,
      paddingHorizontal: 12, height: 40,
    },
    searchInput: { flex: 1, color: colors.text.primary, fontSize: typography.size.sm },

    list: { padding: spacing.md },
    card: {
      backgroundColor: colors.bg.secondary,
      borderWidth: 1, borderColor: colors.border.default,
      borderRadius: spacing.radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    cardTitle: { color: colors.text.primary, fontSize: typography.size.base, fontWeight: typography.weight.bold, flex: 1, marginRight: 8 },
    
    statusPill: {
      borderWidth: 1, borderColor: colors.brand.primary + '40',
      backgroundColor: colors.brand.primary + '10',
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    },
    statusText: { color: colors.brand.primary, fontSize: 11, fontWeight: '600' },
    
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    infoText: { color: colors.text.secondary, fontSize: typography.size.sm, flexShrink: 1 },
    
    footer: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border.default,
    },
    dateCol: { gap: 2 },
    dateLabel: { color: colors.text.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    dateValue: { color: colors.text.secondary, fontSize: 11 },
    editBtn: { padding: 4 },

    emptyText: { textAlign: 'center', color: colors.text.muted, marginTop: 40, fontSize: typography.size.sm }
  });

  const renderItem = ({ item }) => {
    const name = item.projectName || item.name || 'Unnamed Project';
    const status = item.projectStatus || item.status || 'Draft';
    const location = item.city || item.location || 'Unknown Location';
    const type = item.projectType || item.type || 'N/A';

    return (
      <TouchableOpacity 
        style={themed.card} 
        activeOpacity={0.75}
        onPress={() => navigation.navigate('ProjectDetail', { id: item.id, name })}
      >
        <View style={themed.cardHeader}>
          <Text style={themed.cardTitle} numberOfLines={1}>{name}</Text>
          <View style={themed.statusPill}>
            <Text style={themed.statusText}>{status}</Text>
          </View>
        </View>
  
        <View style={themed.infoRow}>
          <Feather name="map-pin" size={14} color={colors.text.muted} />
          <Text style={themed.infoText} numberOfLines={1}>{location}</Text>
        </View>
        
        <View style={themed.infoRow}>
          <Feather name="layout" size={14} color={colors.text.muted} />
          <Text style={themed.infoText} numberOfLines={1}>
            {type}
          </Text>
        </View>
  
        <View style={themed.footer}>
          <View style={themed.dateCol}>
            <Text style={themed.dateLabel}>Created</Text>
            <Text style={themed.dateValue}>
              {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </Text>
          </View>
          <View style={themed.dateCol}>
            <Text style={themed.dateLabel}>Updated</Text>
            <Text style={themed.dateValue}>
              {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </Text>
          </View>
          <View style={themed.editBtn}>
            <Feather name="edit-2" size={16} color={colors.text.muted} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation?.openDrawer?.()} />

      <View style={themed.header}>
        <View style={themed.titleRow}>
          <Text style={themed.title}>Projects</Text>
          <TouchableOpacity style={themed.createBtn} activeOpacity={0.7} onPress={() => navigation.navigate('ProjectDetail', { id: 'new', name: 'New Project' })}>
            <Feather name="plus" size={14} color={colors.brand.primary} />
            <Text style={themed.createBtnText}>Create Project</Text>
          </TouchableOpacity>
        </View>
        <Text style={themed.subtitle}>Create, view and edit Projects. Assign users to Projects.</Text>

        <FlatList 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: spacing.md }}
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
          data={tabs}
          keyExtractor={(item) => item}
          renderItem={({ item: tab }) => {
            const count = tab === 'All' ? data.length : data.filter(d => (d.projectStatus || d.status) === tab).length;
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[themed.tabBtn, activeTab === tab && themed.tabBtnActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[themed.tabText, activeTab === tab && themed.tabTextActive]}>{tab}</Text>
                <View style={themed.badge}><Text style={themed.badgeText}>{count}</Text></View>
              </TouchableOpacity>
            );
          }}
        />

        <View style={themed.searchRow}>
          <View style={themed.searchWrap}>
            <Feather name="search" size={16} color={colors.text.muted} />
            <TextInput
              style={themed.searchInput}
              placeholder="Search project, location or type..."
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brand.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id?.toString()}
          renderItem={renderItem}
          contentContainerStyle={themed.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
          ListEmptyComponent={<Text style={themed.emptyText}>No Projects found.</Text>}
        />
      )}
    </View>
  );
}
