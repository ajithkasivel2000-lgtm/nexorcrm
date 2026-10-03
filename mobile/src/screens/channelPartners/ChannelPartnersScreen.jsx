import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Text, TextInput,
  TouchableOpacity, ActivityIndicator, ScrollView, Modal, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { channelPartnersService } from '../../services/channelPartners';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import TabStrip from '../../components/TabStrip';
import ListToolbar from '../../components/ListToolbar';
import SelectField from '../../components/SelectField';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatMobile = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : String(value || '—');
};

/* Columns — the web Channel Partners table's set. */
const COLUMNS = [
  { key: 'cpId',         label: 'CP Id',          width: 100, exportValue: (r) => r.cpId || '' },
  { key: 'companyName',  label: 'Company Name',   width: 150, exportValue: (r) => r.companyName || '' },
  { key: 'ownerName',    label: "Partner's Name", width: 130, exportValue: (r) => r.ownerName || '' },
  { key: 'mobileNumber', label: 'Mobile',         width: 122, exportValue: (r) => r.mobileNumber || '' },
  { key: 'emailAddress', label: 'Email Address',  width: 160, exportValue: (r) => r.emailAddress || '' },
  { key: 'status',       label: 'Status',         width: 120, exportValue: (r) => r.status || '' },
  { key: 'createdAt',    label: 'Created Date',   width: 128, exportValue: (r) => formatDateTime(r.createdAt) },
];

const SL_NO_WIDTH = 48;
const CHECK_COL_WIDTH = 40;
const ACTIONS_WIDTH = 44;

const FILTER_FIELDS = [{ key: 'status', label: 'Status' }];

const STATUS_TONE = {
  Registered:  { bg: '#E0EDFF', text: '#1D4ED8' },
  Active:      { bg: '#E8F7EF', text: '#0F8A4B' },
  'On Hold':   { bg: '#FEF3C7', text: '#B45309' },
  Terminated:  { bg: '#FEE2E2', text: '#B91C1C' },
};
const DARK_TONE = {
  Registered:  { bg: '#172554', text: '#93C5FD' },
  Active:      { bg: '#14281A', text: '#6EE7B7' },
  'On Hold':   { bg: '#78350F', text: '#FCD34D' },
  Terminated:  { bg: '#450A0A', text: '#FCA5A5' },
};

/**
 * Channel Partners — the mobile twin of the web page: title + Create button,
 * status tabs, search, toolbar, selectable table with CP ID / company /
 * partner / mobile / email / status / created date and row actions.
 */
export default function ChannelPartnersScreen({ navigation }) {
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

  /* Create / edit form */
  const [formOpen, setFormOpen]   = useState(false);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState({
    typeOfChannelPartner: '', companyName: '', ownerName: '', mobileNumber: '',
    officeLandline: '', emailAddress: '', companyRegistrationNumber: '',
    registeredAddress: '', communicationAddress: '', message: '', websiteUrl: '',
    status: 'Registered',
  });
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await channelPartnersService.getChannelPartners();
      const data = Array.isArray(res) ? res : (res?.partners || res?.data || []);
      /* Newest activity first — web sorts the same way. */
      data.sort((a, b) => {
        const aD = new Date(a.updatedAt || a.createdAt).getTime();
        const bD = new Date(b.updatedAt || b.createdAt).getTime();
        return bD - aD;
      });
      setItems(data);
    } catch (e) {
      console.error('Channel partners fetch error', e?.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* Status tabs with counts — tabsFrom="status" */
  const tabs = useMemo(() => {
    const counts = new Map();
    for (const row of items) {
      const v = row.status;
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
    return items.filter((row) => String(row.status ?? '') === String(activeTab));
  }, [items, activeTab]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabScoped;
    return tabScoped.filter((l) =>
      [l.companyName, l.ownerName, l.mobileNumber]
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

  const deleteSelected = () => {
    const ids = [...selected];
    Alert.alert('Delete channel partners', `Are you sure you wish to delete ${ids.length} selected Channel Partner(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await Promise.all(ids.map((id) => api.delete(`/channel-partners/${id}`)));
            setSelected(new Set());
            fetchItems();
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.message || 'Could not reach the server.');
          }
        },
      },
    ]);
  };

  /* ---- create / edit ----------------------------------------------------- */
  const openCreate = () => {
    navigation.navigate('CreateChannelPartner');
  };

  const openEdit = (row) => {
    navigation.navigate('EditChannelPartner', { id: row.id });
  };

  const themed = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    titleBar: {
      paddingHorizontal: spacing.screenH, paddingTop: spacing.md, paddingBottom: spacing.sm,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    title: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    subtitle: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
    createBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: colors.brand.primary, borderRadius: 9,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    createBtnText: { color: '#fff', fontSize: typography.size.xs, fontWeight: '600' },
    deleteBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: '#EF4444', borderRadius: 9,
      paddingHorizontal: 10, paddingVertical: 7,
    },
    deleteBtnText: { color: '#EF4444', fontSize: typography.size.xs, fontWeight: '600' },
    body: { flex: 1, paddingHorizontal: spacing.screenH, paddingBottom: spacing.md },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.bg.secondary,
      borderRadius: 22, borderWidth: 1, borderColor: colors.border.default,
      paddingHorizontal: spacing.md, height: 42, flex: 1,
    },
    searchText: { flex: 1, color: colors.text.primary, fontSize: typography.size.base },

    tableWrap: {
      flex: 1,
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1, borderColor: colors.border.default,
      overflow: 'hidden',
    },
    headRow: {
      flexDirection: 'row', backgroundColor: colors.bg.tertiary,
      borderBottomWidth: 1, borderBottomColor: colors.border.default, paddingVertical: 10,
    },
    headCell: {
      color: colors.text.secondary, fontSize: 10, fontWeight: '700',
      letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 8,
    },
    row: {
      flexDirection: 'row', alignItems: 'center',
      borderBottomWidth: 1, borderBottomColor: colors.border.subtle, paddingVertical: 10,
    },
    cell: { paddingHorizontal: 8, color: colors.text.primary, fontSize: typography.size.xs },
    cellMuted: { color: colors.text.muted },
    cellStrong: { fontWeight: '600' },
    slNoCell: {
      width: SL_NO_WIDTH, textAlign: 'center', color: colors.text.muted,
      fontSize: typography.size.xs, fontWeight: '600',
    },
    checkCol: { width: CHECK_COL_WIDTH, alignItems: 'center', justifyContent: 'center' },
    checkbox: {
      width: 17, height: 17, borderRadius: 4, borderWidth: 1.5,
      borderColor: colors.text.muted, alignItems: 'center', justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
    actionBtn: {
      width: 26, height: 26, borderRadius: 7,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.tertiary,
    },

    footer: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: 10,
      borderTopWidth: 1, borderTopColor: colors.border.default, gap: 8,
    },
    pageSizeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pageSizeLabel: { color: colors.text.muted, fontSize: typography.size.xs },
    pageSizeBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: colors.border.default, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.bg.secondary,
    },
    pageSizeText: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600' },
    rangeText: { color: colors.text.muted, fontSize: typography.size.xs, flex: 1, textAlign: 'center' },
    pager: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    pageBtn: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    pageBtnDisabled: { opacity: 0.35 },
    pageLabel: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600', minWidth: 32, textAlign: 'center' },

    emptyWrap: { alignItems: 'center', paddingVertical: 56, gap: 8, width: '100%' },
    emptyTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '600' },
    emptyHint: { color: colors.text.muted, fontSize: typography.size.sm, textAlign: 'center' },

    /* Form sheet */
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },

    // FAB styles
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
    },
  });

  const statusTone = (status) => {
    const tone = isDark ? DARK_TONE[status] : STATUS_TONE[status];
    return tone || (isDark ? { bg: '#1E293B', text: '#94A3B8' } : { bg: '#EEF0F4', text: '#64748B' });
  };

  const CheckBox = ({ on, onPress }) => (
    <TouchableOpacity style={[themed.checkbox, on && themed.checkboxOn]} onPress={onPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      {on ? <Feather name="check" size={12} color="#fff" /> : null}
    </TouchableOpacity>
  );

  const renderCell = (item, col) => {
    if (col.key === 'status') {
      const status = item.status || '';
      const tone = statusTone(status);
      return (
        <View
          style={{
            width: col.width - 16, flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.text + '55',
            borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
            alignSelf: 'flex-start', overflow: 'hidden',
          }}
        >
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone.text }} />
          <Text style={{ color: tone.text, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
            {status || '—'}
          </Text>
        </View>
      );
    }
    if (col.key === 'cpId' || col.key === 'createdAt') {
      return (
        <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
          {col.key === 'cpId' ? (item.cpId || '—') : formatDateTime(item.createdAt)}
        </Text>
      );
    }
    if (col.key === 'mobileNumber') {
      return (
        <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
          {formatMobile(item.mobileNumber)}
        </Text>
      );
    }
    return (
      <Text style={[themed.cell, col.key === 'companyName' && themed.cellStrong, { width: col.width }]} numberOfLines={1}>
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
        <View style={{ width: ACTIONS_WIDTH, alignItems: 'center' }}>
          <TouchableOpacity
            style={themed.actionBtn}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            onPress={() => openEdit(item)}
          >
            <Feather name="edit-2" size={13} color={colors.text.muted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation?.openDrawer?.()} />

      <View style={themed.titleBar}>
        <View style={{ flex: 1 }}>
          <Text style={themed.title}>Channel Partners</Text>
          <Text style={themed.subtitle}>Create, view and edit Channel Partners. Assign users to Lead List</Text>
        </View>
        <TouchableOpacity style={themed.createBtn} activeOpacity={0.8} onPress={openCreate}>
          <Feather name="plus" size={14} color="#fff" />
          <Text style={themed.createBtnText}>Create Channel Partner</Text>
        </TouchableOpacity>
      </View>

      <View style={themed.body}>
        <TabStrip tabs={tabs} activeTab={activeTab} onChange={(t) => { setActiveTab(t); setFiltered(null); }} />

        <View style={{ height: spacing.sm }} />

        <View style={themed.searchRow}>
          <View style={themed.searchWrap}>
            <Feather name="search" size={15} color={colors.text.muted} />
            <TextInput
              style={themed.searchText}
              value={search}
              onChangeText={setSearch}
              placeholder="Search company, partner or mobile..."
              placeholderTextColor={colors.text.muted}
              returnKeyType="search"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={15} color={colors.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <ListToolbar
            fields={FILTER_FIELDS}
            rows={searched}
            visibleColumns={visibleColumns}
            hidden={hidden}
            onToggleColumn={toggleColumn}
            onFiltered={setFiltered}
            exportName="channel-partners"
          />
        </View>

        {selected.size > 0 ? (
          <TouchableOpacity style={[themed.deleteBtn, { alignSelf: 'flex-end', marginBottom: spacing.sm }]} onPress={deleteSelected}>
            <Feather name="trash-2" size={13} color="#EF4444" />
            <Text style={themed.deleteBtnText}>Delete ({selected.size})</Text>
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.brand.primary} />
          </View>
        ) : (
          <View style={themed.tableWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
              <View style={{ width: tableWidth }}>
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
                      <Text style={themed.emptyTitle}>No channel partners yet</Text>
                      <Text style={themed.emptyHint}>Create your first channel partner to get started.</Text>
                    </View>
                  }
                  showsVerticalScrollIndicator={false}
                />

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

      {/* FAB (Floating Action Button) to quickly Add Channel Partner */}
      <TouchableOpacity
        style={[themed.fab, { backgroundColor: colors.brand.primary }]}
        activeOpacity={0.8}
        onPress={openCreate}
      >
        <Feather name="plus" size={24} color="#FFF" />
      </TouchableOpacity>
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
