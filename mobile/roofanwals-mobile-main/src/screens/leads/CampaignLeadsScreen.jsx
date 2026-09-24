import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Text, TextInput,
  TouchableOpacity, ActivityIndicator, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { leadsService } from '../../services/leads';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import ListToolbar from '../../components/ListToolbar';
import { isCampaignLead, campaignOf, messageOf } from '../../utils/campaignLead';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const STATUS_BADGE = {
  'New Lead':  { bg: '#1E293B', text: '#38BDF8' },
  New:         { bg: '#1E293B', text: '#38BDF8' },
  Open:        { bg: '#1C3349', text: '#60A5FA' },
  Qualified:   { bg: '#1A2E22', text: '#34D399' },
  Opportunity: { bg: '#1A2E22', text: '#34D399' },
  'Site Visit':{ bg: '#2D2416', text: '#FBBF24' },
  Duplicate:   { bg: '#2D2416', text: '#FBBF24' },
  Rejected:    { bg: '#2D1B1B', text: '#F87171' },
  Won:         { bg: '#14281A', text: '#10B981' },
  Lost:        { bg: '#2D1B1B', text: '#F87171' },
};

function formatMobile(m) {
  if (!m) return '';
  const s = String(m).replace(/[^\d+]/g, '');
  return s.length > 10 ? s.slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2') : s;
}

/* Columns — the web table's set, with fixed widths for the aligned table. */
const COLUMNS = [
  { key: 'name',            label: 'Leads Name',        width: 130, exportValue: (r) => r.name || '' },
  { key: 'mobile',          label: 'Phone Number',      width: 118, exportValue: (r) => r.phone || r.mobile || '' },
  { key: 'primarySource',   label: 'Primary Source',    width: 108, exportValue: (r) => r.primarySource || '' },
  { key: 'secondarySource', label: 'Secondary Source',  width: 118, exportValue: (r) => r.secondarySource || '' },
  { key: 'project',         label: 'Project Interested',width: 130, exportValue: (r) => r.project || '' },
  { key: 'status',          label: 'Status',            width: 100, exportValue: (r) => r.status || '' },
  { key: 'owner',           label: 'Owner',             width: 108, exportValue: (r) => r.ownerName || r.owner || '' },
  { key: 'remarks',         label: 'Remarks',           width: 80,  exportValue: (r) => r.callRemarks || r.reasonDetails || '' },
  { key: 'campaign',        label: 'Campaign',          width: 118, exportValue: (r) => campaignOf(r) },
  { key: 'message',         label: 'Message',           width: 148, exportValue: (r) => messageOf(r) },
];

const SL_NO_WIDTH = 48;
const ACTIONS_WIDTH = 76;

/* Filter fields — same set the web page passes to its table. */
const FILTER_FIELDS = [
  { key: 'campaign',      label: 'Campaign',      getValue: (r) => campaignOf(r) },
  { key: 'primarySource', label: 'Primary Source' },
  { key: 'project',       label: 'Project' },
  { key: 'status',        label: 'Status' },
  { key: 'owner',         label: 'Owner',         getValue: (r) => r.ownerName || r.owner },
];

/**
 * Campaign Leads — the mobile twin of the web CampaignLeads page:
 * a real table with column headers, horizontally scrollable like the web's.
 */
export default function CampaignLeadsScreen({ navigation }) {
  const { colors } = useTheme();

  const [leads, setLeads]           = useState([]);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden]         = useState([]);
  const [filtered, setFiltered]     = useState(null);
  const searchTimer = useRef(null);

  const fetchLeads = useCallback(async (q = '') => {
    try {
      const res = await leadsService.getLeads({ page: 1, limit: 200, search: q });
      const items = Array.isArray(res) ? res : (res?.leads || res?.data || []);
      setLeads(items.filter(isCampaignLead));
    } catch (e) {
      console.error('Campaign leads fetch error', e?.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLeads(''); }, [fetchLeads]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setLoading(true);
      fetchLeads(search);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.phone || l.mobile, l.project, l.ownerName || l.owner]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [leads, search]);

  const visibleColumns = useMemo(() => COLUMNS.filter((c) => !hidden.includes(c.key)), [hidden]);
  const tableWidth = SL_NO_WIDTH + visibleColumns.reduce((s, c) => s + c.width, 0) + ACTIONS_WIDTH;

  const toggleColumn = (key) => {
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const rows = filtered ?? searched;

  const themed = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    titleBar: {
      paddingHorizontal: spacing.screenH,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    title:    { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    subtitle: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
    body:  { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.sm },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.bg.secondary,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: spacing.md,
      height: 44,
      marginBottom: spacing.sm,
    },
    searchText: { flex: 1, color: colors.text.primary, fontSize: typography.size.base },
    toolbarRow: { marginBottom: spacing.sm },
    tableWrap: {
      flex: 1,
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
    },
    headRow: {
      flexDirection: 'row',
      backgroundColor: colors.bg.tertiary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
      paddingVertical: 10,
    },
    headCell: {
      color: colors.text.secondary,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      paddingHorizontal: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      paddingVertical: 10,
    },
    cell: {
      paddingHorizontal: 8,
      color: colors.text.primary,
      fontSize: typography.size.xs,
    },
    cellMuted: { color: colors.text.muted },
    slNoCell: {
      width: SL_NO_WIDTH,
      textAlign: 'center',
      color: colors.text.muted,
      fontSize: typography.size.xs,
      fontWeight: '600',
    },
    actionsCell: {
      width: ACTIONS_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      fontSize: 10,
      fontWeight: '600',
      overflow: 'hidden',
    },
    campaignPill: {
      alignSelf: 'flex-start',
      backgroundColor: colors.brand.primary + '1F',
      borderWidth: 1,
      borderColor: colors.brand.primary + '55',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      color: colors.brand.light,
      fontSize: 10,
      fontWeight: '600',
      overflow: 'hidden',
    },
    nameCell: { fontWeight: '600' },
    emptyWrap: { alignItems: 'center', paddingVertical: 64, gap: 8, width: '100%' },
    emptyTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '600' },
  });

  const cellText = (item, col) => {
    if (col.key === 'name') return item.name || 'Unknown';
    if (col.key === 'mobile') return formatMobile(item.phone || item.mobile) || '—';
    if (col.key === 'owner') return item.ownerName || item.owner || '—';
    return item[col.key] || '—';
  };

  const renderCell = (item, col) => {
    if (col.key === 'status') {
      const badge = STATUS_BADGE[item.status] || STATUS_BADGE.New;
      return (
        <Text style={[themed.statusPill, { width: col.width - 16, backgroundColor: badge.bg, color: badge.text }]} numberOfLines={1}>
          {item.status || 'New'}
        </Text>
      );
    }
    if (col.key === 'campaign') {
      const campaign = campaignOf(item);
      return (
        <Text style={[themed.campaignPill, { width: col.width - 16 }]} numberOfLines={1}>
          {campaign || 'Unnamed'}
        </Text>
      );
    }
    if (col.key === 'remarks' || col.key === 'message') {
      const text = col.key === 'remarks' ? (item.callRemarks || item.reasonDetails || '') : messageOf(item);
      return (
        <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
          {text || '—'}
        </Text>
      );
    }
    return (
      <Text style={[themed.cell, col.key === 'name' && themed.nameCell, { width: col.width }]} numberOfLines={1}>
        {cellText(item, col)}
      </Text>
    );
  };

  const renderRow = ({ item, index }) => (
    <TouchableOpacity
      style={themed.row}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('LeadDetail', { id: item.id, name: item.name || 'Campaign Lead' })}
    >
      <Text style={themed.slNoCell}>{index + 1}</Text>
      {visibleColumns.map((col) => (
        <View key={col.key}>{renderCell(item, col)}</View>
      ))}
      <View style={themed.actionsCell}>
        <Feather name="more-horizontal" size={16} color={colors.text.muted} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation.openDrawer()} />

      <View style={themed.titleBar}>
        <Text style={themed.title}>Campaign Leads</Text>
        <Text style={themed.subtitle}>Leads captured from marketing campaigns through your public campaign links.</Text>
      </View>

      <View style={themed.body}>
        {/* Search */}
        <View style={themed.searchWrap}>
          <Feather name="search" size={15} color={colors.text.muted} />
          <TextInput
            style={themed.searchText}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, phone, project or owner..."
            placeholderTextColor={colors.text.muted}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={15} color={colors.text.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter / Export / Columns */}
        <View style={themed.toolbarRow}>
          <ListToolbar
            fields={FILTER_FIELDS}
            rows={searched}
            visibleColumns={visibleColumns}
            hidden={hidden}
            onToggleColumn={toggleColumn}
            onFiltered={setFiltered}
            exportName="campaign-leads"
          />
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.brand.primary} />
          </View>
        ) : (
          <View style={themed.tableWrap}>
            {/* Header + rows share one horizontal scroll, so columns stay aligned */}
            <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
              <View style={{ width: tableWidth }}>
                {/* Column header row — as the web table */}
                <View style={themed.headRow}>
                  <Text style={[themed.headCell, { width: SL_NO_WIDTH, textAlign: 'center' }]}>SL.NO</Text>
                  {visibleColumns.map((col) => (
                    <Text key={col.key} style={[themed.headCell, { width: col.width }]} numberOfLines={1}>
                      {col.label}
                    </Text>
                  ))}
                  <Text style={[themed.headCell, { width: ACTIONS_WIDTH, textAlign: 'center' }]}>Actions</Text>
                </View>

                <FlatList
                  data={rows}
                  keyExtractor={(item, i) => String(item.id || i)}
                  renderItem={renderRow}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={() => { setRefreshing(true); fetchLeads(search); }}
                      tintColor={colors.brand.primary}
                    />
                  }
                  ListEmptyComponent={
                    <View style={themed.emptyWrap}>
                      <Feather name="inbox" size={28} color={colors.text.muted} />
                      <Text style={themed.emptyTitle}>No campaign leads yet</Text>
                    </View>
                  }
                  showsVerticalScrollIndicator={false}
                />
              </View>
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: { height: 160, alignItems: 'center', justifyContent: 'center' },
});
