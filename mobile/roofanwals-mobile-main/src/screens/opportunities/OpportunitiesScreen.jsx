import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Text, TextInput,
  TouchableOpacity, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { opportunitiesService } from '../../services/opportunities';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import TabStrip from '../../components/TabStrip';
import ListToolbar from '../../components/ListToolbar';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/* Web's formatMobile: a 10-digit Indian number renders as "+91 XXXXX XXXXX". */
const formatMobile = (m) => {
  if (!m) return '—';
  const s = String(m);
  if (s.length !== 10) return s;
  return `+91 ${s.slice(0, 5)} ${s.slice(5)}`;
};

/* Stage pill tones — as web toneForStatus */
const STAGE_TONE = {
  'Booking Done': { bg: '#E8F7EF', text: '#0F8A4B', dot: '#0F8A4B' },
  'Closed Won':   { bg: '#E8F7EF', text: '#0F8A4B', dot: '#0F8A4B' },
  'Closed Lost':  { bg: '#FDECEC', text: '#C0392B', dot: '#C0392B' },
  Prospecting:    { bg: '#EEF0FF', text: '#4F46E5', dot: '#4F46E5' },
  Qualification:  { bg: '#F3EDFF', text: '#7C3AED', dot: '#7C3AED' },
  Proposal:       { bg: '#FFF6E5', text: '#B45309', dot: '#B45309' },
  Negotiation:    { bg: '#FFF0E8', text: '#C25609', dot: '#C25609' },
};

const DARK_TONE = {
  'Booking Done': { bg: '#14281A', text: '#10B981' },
  'Closed Won':   { bg: '#14281A', text: '#10B981' },
  'Closed Lost':  { bg: '#2D1B1B', text: '#F87171' },
  Prospecting:    { bg: '#1E1B4B', text: '#818CF8' },
  Qualification:  { bg: '#2E1065', text: '#A78BFA' },
  Proposal:       { bg: '#2D2416', text: '#FBBF24' },
  Negotiation:    { bg: '#2D1B14', text: '#FB923C' },
};

/* Columns — the web Opportunities table's set. */
const COLUMNS = [
  { key: 'oppId',            label: 'Opp Id',       width: 104, exportValue: (r) => r.oppId || '' },
  { key: 'opportunityName',  label: 'Opp Name',     width: 128, exportValue: (r) => r.opportunityName || '' },
  { key: 'mobileNumber',     label: 'Mobile',       width: 118, exportValue: (r) => r.mobileNumber || '' },
  { key: 'LeadsProject',     label: 'Project',      width: 118, exportValue: (r) => r.LeadsProject || '' },
  { key: 'stage',            label: 'Status',       width: 122, exportValue: (r) => r.stage || '' },
  { key: 'opportunityOwner', label: 'Owner',        width: 96,  exportValue: (r) => r.opportunityOwner || '' },
  { key: 'createdAt',        label: 'Created Date', width: 128, exportValue: (r) => formatDateTime(r.createdAt) },
  { key: 'updatedAt',        label: 'Updated Date', width: 128, exportValue: (r) => formatDateTime(r.updatedAt || r.createdAt) },
];

const SL_NO_WIDTH = 48;
const ACTIONS_WIDTH = 76;

/* Filter fields — from the table's columns. */
const FILTER_FIELDS = [
  { key: 'stage',            label: 'Status' },
  { key: 'LeadsProject',     label: 'Project' },
  { key: 'opportunityOwner', label: 'Owner', getValue: (r) => r.opportunityOwner },
];

/**
 * Opportunities — the mobile twin of the web Opportunities page:
 * stage tabs with counts, search, toolbar, and a real table with a
 * pagination footer ("1-1 of 1 · 1/1").
 */
export default function OpportunitiesScreen({ navigation }) {
  const { colors, isDark } = useTheme();

  const [items, setItems]           = useState([]);
  const [search, setSearch]         = useState('');
  const [activeTab, setActiveTab]   = useState('All');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden]         = useState([]);
  const [filtered, setFiltered]     = useState(null);
  const [selected, setSelected]     = useState(new Set());
  const [pageSize, setPageSize]     = useState(25);
  const [page, setPage]             = useState(1);
  const [rowsPickerOpen, setRowsPickerOpen] = useState(false);
  const searchTimer = useRef(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await opportunitiesService.getOpportunities({ page: 1, limit: 200 });
      const data = Array.isArray(res) ? res : (res?.opportunities || res?.data || []);
      setItems(data);
    } catch (e) {
      console.error('Opportunities fetch error', e?.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setLoading(true);
      fetchItems();
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Auto tabs from stage — web's tabsFrom="stage" behavior */
  const tabs = useMemo(() => {
    const counts = new Map();
    for (const row of items) {
      const v = row.stage;
      if (v === null || v === undefined || v === '') continue;
      counts.set(String(v), (counts.get(String(v)) || 0) + 1);
    }
    return [
      { id: 'All', label: 'All', count: items.length },
      ...[...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([label, count]) => ({ id: label, label, count })),
    ];
  }, [items]);

  const tabScoped = useMemo(() => {
    if (activeTab === 'All') return items;
    return items.filter((row) => String(row.stage ?? '') === String(activeTab));
  }, [items, activeTab]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabScoped;
    return tabScoped.filter((l) =>
      [l.oppId, l.opportunityName, l.mobileNumber, l.LeadsProject]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [tabScoped, search]);

  const visibleColumns = useMemo(() => COLUMNS.filter((c) => !hidden.includes(c.key)), [hidden]);
  const tableWidth = 40 + SL_NO_WIDTH + visibleColumns.reduce((s, c) => s + c.width, 0) + ACTIONS_WIDTH;

  const toggleColumn = (key) => {
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const rows = filtered ?? searched;

  /* Pagination — web's client-side paging (default 25, 10/25/50/100). */
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  const pageIds = paged.map((r) => String(r.id));
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* Reset to the first page when the result set changes shape. */
  useEffect(() => { setPage(1); }, [search, pageSize, activeTab, filtered]);

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
    cellStrong: { fontWeight: '600' },
    slNoCell: {
      width: SL_NO_WIDTH,
      textAlign: 'center',
      color: colors.text.muted,
      fontSize: typography.size.xs,
      fontWeight: '600',
    },
    actionsCell: {
      width: ACTIONS_WIDTH,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    checkCol: { width: 40, alignItems: 'center', justifyContent: 'center' },
    checkbox: {
      width: 17, height: 17, borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.text.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },

    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      gap: 8,
    },
    pageSizeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pageSizeLabel: { color: colors.text.muted, fontSize: typography.size.xs },
    pageSizeBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: colors.border.default,
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
      backgroundColor: colors.bg.secondary,
    },
    pageSizeText: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600' },
    rangeText: { color: colors.text.muted, fontSize: typography.size.xs, flex: 1, textAlign: 'center' },
    pager: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    pageBtn: {
      width: 26, height: 26, borderRadius: 6,
      alignItems: 'center', justifyContent: 'center',
      opacity: 1,
    },
    pageBtnDisabled: { opacity: 0.35 },
    pageLabel: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600', minWidth: 32, textAlign: 'center' },
    emptyWrap: { alignItems: 'center', paddingVertical: 64, gap: 8, width: '100%' },
    emptyTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '600' },
  });

  const stageTone = (stage) => {
    const tone = isDark ? DARK_TONE[stage] : STAGE_TONE[stage];
    return tone || (isDark ? { bg: '#1E293B', text: '#94A3B8' } : { bg: '#EEF0F4', text: '#64748B' });
  };

  const renderCell = (item, col) => {
    if (col.key === 'stage') {
      const stage = item.stage || '';
      const tone = stageTone(stage);
      return (
        <View
          style={{
            width: col.width - 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: tone.bg,
            borderWidth: 1,
            borderColor: tone.text + '55',
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 3,
            alignSelf: 'flex-start',
            overflow: 'hidden',
          }}
        >
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone.text }} />
          <Text style={{ color: tone.text, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
            {stage || '—'}
          </Text>
        </View>
      );
    }
    if (col.key === 'oppId') {
      return (
        <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
          {item.oppId || '—'}
        </Text>
      );
    }
    if (col.key === 'mobileNumber') {
      return (
        <Text style={[themed.cell, { width: col.width }]} numberOfLines={1}>
          {formatMobile(item.mobileNumber) || '—'}
        </Text>
      );
    }
    if (col.key === 'createdAt' || col.key === 'updatedAt') {
      return (
        <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
          {formatDateTime(col.key === 'createdAt' ? item.createdAt : (item.updatedAt || item.createdAt))}
        </Text>
      );
    }
    const text = col.key === 'opportunityName'
      ? (item.opportunityName || '—')
      : col.key === 'opportunityOwner'
        ? (item.opportunityOwner || '—')
        : (item[col.key] || '—');
    return (
      <Text style={[themed.cell, col.key === 'opportunityName' && themed.cellStrong, { width: col.width }]} numberOfLines={1}>
        {text}
      </Text>
    );
  };

  const CheckBox = ({ on, onPress }) => (
    <TouchableOpacity style={[themed.checkbox, on && themed.checkboxOn]} onPress={onPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      {on ? <Feather name="check" size={12} color="#fff" /> : null}
    </TouchableOpacity>
  );

  const renderRow = ({ item, index }) => {
    const rowNo = (currentPage - 1) * pageSize + index + 1;
    return (
    <TouchableOpacity
      style={themed.row}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('OpportunityDetail', { id: item.id, name: item.opportunityName || item.oppId })}
    >
      <View style={themed.checkCol} pointerEvents="box-none">
        <CheckBox on={selected.has(String(item.id))} onPress={() => toggleRow(String(item.id))} />
      </View>
      <Text style={themed.slNoCell}>{rowNo}</Text>
      {visibleColumns.map((col) => (
        <View key={col.key}>{renderCell(item, col)}</View>
      ))}
      <View style={themed.actionsCell} pointerEvents="box-none">
        <TouchableOpacity hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={() => navigation.navigate('OpportunityDetail', { id: item.id, name: item.opportunityName || item.oppId })}>
          <Feather name="eye" size={15} color={colors.text.muted} />
        </TouchableOpacity>
        <Feather name="edit-2" size={14} color={colors.text.muted} />
      </View>
    </TouchableOpacity>
    );
  };

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation.openDrawer()} />

      <View style={themed.titleBar}>
        <Text style={themed.title}>Opportunities</Text>
        <Text style={themed.subtitle}>Leads that have converted into active opportunities.</Text>
      </View>

      <View style={themed.body}>
        {/* Stage tabs with counts — All + one per stage */}
        <TabStrip tabs={tabs} activeTab={activeTab} onChange={(t) => { setActiveTab(t); setFiltered(null); }} />

        <View style={{ height: spacing.sm }} />

        {/* Search */}
        <View style={themed.searchWrap}>
          <Feather name="search" size={15} color={colors.text.muted} />
          <TextInput
            style={themed.searchText}
            value={search}
            onChangeText={setSearch}
            placeholder="Search id, name, mobile or project..."
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
            exportName="opportunities"
          />
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.brand.primary} />
          </View>
        ) : (
          <View style={themed.tableWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
              <View style={{ width: tableWidth }}>
                {/* Column header row */}
                <View style={themed.headRow}>
                  <View style={themed.checkCol}>
                    <CheckBox on={allOnPageSelected} onPress={toggleAll} />
                  </View>
                  <Text style={[themed.headCell, { width: SL_NO_WIDTH, textAlign: 'center' }]}>Sl.No</Text>
                  {visibleColumns.map((col) => (
                    <Text key={col.key} style={[themed.headCell, { width: col.width }]} numberOfLines={1}>
                      {col.label}
                    </Text>
                  ))}
                  <Text style={[themed.headCell, { width: ACTIONS_WIDTH, textAlign: 'center' }]}>Actions</Text>
                </View>

                <FlatList
                  data={paged}
                  keyExtractor={(item, i) => String(item.id || i)}
                  renderItem={renderRow}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={() => { setRefreshing(true); fetchItems(); }}
                      tintColor={colors.brand.primary}
                    />
                  }
                  ListEmptyComponent={
                    <View style={themed.emptyWrap}>
                      <Feather name="inbox" size={28} color={colors.text.muted} />
                      <Text style={themed.emptyTitle}>No opportunities found</Text>
                    </View>
                  }
                  showsVerticalScrollIndicator={false}
                />

                {/* Pagination footer — Rows selector · range · pager */}
                {total > 0 && (
                  <View style={themed.footer}>
                    <View style={themed.pageSizeWrap}>
                      <Text style={themed.pageSizeLabel}>Rows</Text>
                      <TouchableOpacity style={themed.pageSizeBtn} onPress={() => setRowsPickerOpen(true)}>
                        <Text style={themed.pageSizeText}>{pageSize}</Text>
                        <Feather name="chevron-down" size={12} color={colors.text.muted} />
                      </TouchableOpacity>
                    </View>

                    <Text style={themed.rangeText}>
                      {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total}
                    </Text>

                    <View style={themed.pager}>
                      <TouchableOpacity style={[themed.pageBtn, currentPage === 1 && themed.pageBtnDisabled]} disabled={currentPage === 1} onPress={() => setPage(1)}>
                        <Feather name="chevrons-left" size={14} color={colors.text.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[themed.pageBtn, currentPage === 1 && themed.pageBtnDisabled]} disabled={currentPage === 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                        <Feather name="chevron-left" size={14} color={colors.text.primary} />
                      </TouchableOpacity>
                      <Text style={themed.pageLabel}>{currentPage} / {pageCount}</Text>
                      <TouchableOpacity style={[themed.pageBtn, currentPage === pageCount && themed.pageBtnDisabled]} disabled={currentPage === pageCount} onPress={() => setPage((p) => Math.min(pageCount, p + 1))}>
                        <Feather name="chevron-right" size={14} color={colors.text.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[themed.pageBtn, currentPage === pageCount && themed.pageBtnDisabled]} disabled={currentPage === pageCount} onPress={() => setPage(pageCount)}>
                        <Feather name="chevrons-right" size={14} color={colors.text.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      {/* Rows-per-page picker */}
      <Modal visible={rowsPickerOpen} transparent animationType="fade" onRequestClose={() => setRowsPickerOpen(false)}>
        <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={() => setRowsPickerOpen(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
            {[10, 25, 50, 100].map((n) => (
              <TouchableOpacity
                key={n}
                style={styles.pickerRow}
                onPress={() => { setPageSize(n); setRowsPickerOpen(false); }}
              >
                <Text style={[styles.pickerText, { color: colors.text.primary }, pageSize === n && { color: colors.brand.primary, fontWeight: '600' }]}>
                  {n} rows
                </Text>
                {pageSize === n ? <Feather name="check" size={15} color={colors.brand.primary} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  pickerSheet: { width: 200, borderRadius: 12, borderWidth: 1, overflow: 'hidden', elevation: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.18)' },
  pickerText: { fontSize: 13 },
  loadingRow: { height: 160, alignItems: 'center', justifyContent: 'center' },
});
