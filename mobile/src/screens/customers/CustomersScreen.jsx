import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Text, TextInput,
  TouchableOpacity, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { customersService } from '../../services/customers';
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

/* Columns — the web Customers table's set. */
const COLUMNS = [
  { key: 'customerId',   label: 'Customer Id',   width: 116, exportValue: (r) => r.customerId || '' },
  { key: 'customerName', label: 'Customer Name', width: 150, exportValue: (r) => r.customerName || '' },
  { key: 'customerEmail',label: 'Email',         width: 170, exportValue: (r) => r.customerEmail || '' },
  { key: 'customerMobile', label: 'Mobile',      width: 118, exportValue: (r) => r.customerMobile || '' },
  { key: 'stage',        label: 'Stage',         width: 130, exportValue: (r) => r.stage || '' },
  { key: 'createdAt',    label: 'Created Date',  width: 128, exportValue: (r) => formatDateTime(r.createdAt) },
];

const SL_NO_WIDTH = 48;
const CHECK_COL_WIDTH = 40;
const ACTIONS_WIDTH = 0; // read-only screen on web: no actions column

const FILTER_FIELDS = [
  { key: 'stage', label: 'Stage' },
];

const STAGE_TONE = {
  'Booking Done': { bg: '#E8F7EF', text: '#0F8A4B' },
  'Closed Won':   { bg: '#E8F7EF', text: '#0F8A4B' },
  Prospecting:    { bg: '#EEF0FF', text: '#4F46E5' },
  Qualification:  { bg: '#F3EDFF', text: '#7C3AED' },
};

const DARK_TONE = {
  'Booking Done': { bg: '#14281A', text: '#10B981' },
  'Closed Won':   { bg: '#14281A', text: '#10B981' },
  Prospecting:    { bg: '#1E1B4B', text: '#818CF8' },
  Qualification:  { bg: '#2E1065', text: '#A78BFA' },
};

/**
 * Customers — the mobile twin of the web Customers page:
 * read-only table with stage tabs, search, toolbar, checkboxes and pagination.
 */
export default function CustomersScreen({ navigation }) {
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

  const fetchItems = useCallback(async () => {
    try {
      const res = await customersService.getCustomers();
      const data = Array.isArray(res) ? res : (res?.customers || res?.data || []);
      /* Newest activity first — web sorts the same way. */
      data.sort((a, b) => {
        const aD = new Date(a.updatedAt || a.createdAt).getTime();
        const bD = new Date(b.updatedAt || b.createdAt).getTime();
        return bD - aD;
      });
      setItems(data);
    } catch (e) {
      console.error('Customers fetch error', e?.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* Stage tabs with counts — tabsFrom="stage" */
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
      [l.customerName, l.customerEmail, l.customerMobile]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [tabScoped, search]);

  const visibleColumns = useMemo(() => COLUMNS.filter((c) => !hidden.includes(c.key)), [hidden]);
  const tableWidth = CHECK_COL_WIDTH + SL_NO_WIDTH
    + visibleColumns.reduce((s, c) => s + c.width, 0) + ACTIONS_WIDTH;

  const toggleColumn = (key) => {
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const rows = filtered ?? searched;

  /* Pagination */
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
    checkCol: { width: CHECK_COL_WIDTH, alignItems: 'center', justifyContent: 'center' },
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
    },
    pageBtnDisabled: { opacity: 0.35 },
    pageLabel: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600', minWidth: 32, textAlign: 'center' },

    emptyWrap: { alignItems: 'center', paddingVertical: 64, gap: 8, width: '100%' },
    emptyTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '600' },
    emptyHint: { color: colors.text.muted, fontSize: typography.size.sm, textAlign: 'center' },
  });

  const stageTone = (stage) => {
    const tone = isDark ? DARK_TONE[stage] : STAGE_TONE[stage];
    return tone || (isDark ? { bg: '#1E293B', text: '#94A3B8' } : { bg: '#EEF0F4', text: '#64748B' });
  };

  const CheckBox = ({ on, onPress }) => (
    <TouchableOpacity style={[themed.checkbox, on && themed.checkboxOn]} onPress={onPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      {on ? <Feather name="check" size={12} color="#fff" /> : null}
    </TouchableOpacity>
  );

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
    if (col.key === 'customerId') {
      return (
        <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
          {item.customerId || '—'}
        </Text>
      );
    }
    if (col.key === 'createdAt') {
      return (
        <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
          {formatDateTime(item.createdAt)}
        </Text>
      );
    }
    return (
      <Text style={[themed.cell, col.key === 'customerName' && themed.cellStrong, { width: col.width }]} numberOfLines={1}>
        {item[col.key] || '—'}
      </Text>
    );
  };

  const renderRow = ({ item, index }) => {
    const rowNo = (currentPage - 1) * pageSize + index + 1;
    return (
      <View style={themed.row}>
        <View style={themed.checkCol}>
          <CheckBox on={selected.has(String(item.id))} onPress={() => toggleRow(String(item.id))} />
        </View>
        <Text style={themed.slNoCell}>{rowNo}</Text>
        {visibleColumns.map((col) => (
          <View key={col.key}>{renderCell(item, col)}</View>
        ))}
      </View>
    );
  };

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation.openDrawer()} />

      <View style={themed.titleBar}>
        <Text style={themed.title}>Customers</Text>
        <Text style={themed.subtitle}>View and manage all customers and their current stage.</Text>
      </View>

      <View style={themed.body}>
        {/* Stage tabs with counts */}
        <TabStrip tabs={tabs} activeTab={activeTab} onChange={(t) => { setActiveTab(t); setFiltered(null); }} />

        <View style={{ height: spacing.sm }} />

        {/* Search */}
        <View style={themed.searchWrap}>
          <Feather name="search" size={15} color={colors.text.muted} />
          <TextInput
            style={themed.searchText}
            value={search}
            onChangeText={setSearch}
            placeholder="Search customer, email or mobile..."
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
            exportName="customers"
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
                      <Text style={themed.emptyTitle}>No customers yet</Text>
                      <Text style={themed.emptyHint}>Customers appear here once a lead is converted.</Text>
                    </View>
                  }
                  showsVerticalScrollIndicator={false}
                />

                {/* Pagination footer */}
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
  loadingRow: { height: 160, alignItems: 'center', justifyContent: 'center' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  pickerSheet: { width: 200, borderRadius: 12, borderWidth: 1, overflow: 'hidden', elevation: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.18)' },
  pickerText: { fontSize: 13 },
});
