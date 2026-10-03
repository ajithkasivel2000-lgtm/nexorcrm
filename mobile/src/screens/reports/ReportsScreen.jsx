import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { leadsService } from '../../services/leads';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import ListToolbar from '../../components/ListToolbar';
import SelectField from '../../components/SelectField';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const formatReportDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/* Web's formatMobile: only 10-digit numbers get the +91 prefix. */
const formatMobile = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : String(value || '—');
};

const REPORT_TYPES = ['Today', 'Yesterday', 'This Week', 'This Month'];
const SOURCE_KEYS = ['Channel Partner', 'Direct Walk In', 'Outdoor Marketing', 'Digital Marketing'];
const STATUS_OPTIONS = ['', 'New Lead', 'Attempted', 'Interested', 'Duplicate', 'Rejected', 'Site Visit'];

/* Columns — the web report table's set. */
const COLUMNS = [
  { key: 'name',           label: 'Leads Name',     width: 140 },
  { key: 'mobile',         label: 'Phone Number',   width: 130 },
  { key: 'primarySource',  label: 'Primary Source', width: 120 },
  { key: 'status',         label: 'Status',         width: 130 },
  { key: 'owner',          label: 'Owner',          width: 100 },
  { key: 'callRemarks',    label: 'Remarks',        width: 76,  center: true },
  { key: 'updatedAt',      label: 'Last update',    width: 128 },
  { key: 'createdAt',      label: 'Created Date',   width: 128 },
];

const SL_NO_WIDTH = 48;
const CHECK_COL_WIDTH = 40;
const ACTIONS_WIDTH = 64;

const STATUS_TONE = {
  'New Lead':   { bg: '#E0EDFF', text: '#1D4ED8' },
  Attempted:    { bg: '#FEF3C7', text: '#B45309' },
  Interested:   { bg: '#E8F7EF', text: '#0F8A4B' },
  Duplicate:    { bg: '#FEF3C7', text: '#B45309' },
  Rejected:     { bg: '#FEE2E2', text: '#B91C1C' },
  'Site Visit': { bg: '#F3EDFF', text: '#7C3AED' },
};
const DARK_TONE = {
  'New Lead':   { bg: '#172554', text: '#93C5FD' },
  Attempted:    { bg: '#78350F', text: '#FCD34D' },
  Interested:   { bg: '#14281A', text: '#6EE7B7' },
  Duplicate:    { bg: '#3F2D0B', text: '#FBBF24' },
  Rejected:     { bg: '#450A0A', text: '#FCA5A5' },
  'Site Visit': { bg: '#2E1065', text: '#C4B5FD' },
};

/**
 * Reports — the mobile twin of the web Export Report page:
 * Report Type / Primary Source checkboxes / Status filter card, then the
 * lead table (search + toolbar + checkboxes + actions + pagination).
 */
export default function ReportsScreen({ navigation }) {
  const { colors, isDark } = useTheme();

  const [leads, setLeads]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Web's three live filters
  const [reportType, setReportType] = useState('Today');
  const [statusFilter, setStatusFilter] = useState('');
  const [primarySources, setPrimarySources] = useState({
    'Channel Partner': false,
    'Direct Walk In': false,
    'Outdoor Marketing': false,
    'Digital Marketing': false,
  });

  // Table state (search, columns, filter sheet, selection, paging)
  const [search, setSearch]         = useState('');
  const [hidden, setHidden]         = useState([]);
  const [filtered, setFiltered]     = useState(null);
  const [selected, setSelected]     = useState(new Set());
  const [pageSize, setPageSize]     = useState(25);
  const [page, setPage]             = useState(1);
  const [rowsPickerOpen, setRowsPickerOpen] = useState(false);
  const [remarksLead, setRemarksLead] = useState(null);

  const fetchLeads = useCallback(async () => {
    try {
      /* Web fetches the full list unpaginated and filters client-side. */
      const res = await leadsService.getLeads({ limit: 5000 });
      const data = Array.isArray(res) ? res : (res?.leads || res?.data || []);
      setLeads(data);
    } catch (e) {
      console.error('Report leads fetch error', e?.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useFocusEffect(useCallback(() => { setLoading(true); fetchLeads(); }, [fetchLeads]));

  /* Report Type (date range) + status + source filtering — web's exact rules */
  const reportRows = useMemo(() => {
    const activeSources = SOURCE_KEYS.filter((k) => primarySources[k]);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return leads.filter((lead) => {
      const matchesStatus = !statusFilter || lead.status === statusFilter;
      const matchesSource = activeSources.length === 0 ||
        (lead.primarySource && activeSources.some((s) => s.toLowerCase() === String(lead.primarySource).toLowerCase()));

      let matchesDate = true;
      if (lead.createdAt) {
        const leadDate = new Date(lead.createdAt);
        if (reportType === 'Today') {
          matchesDate = leadDate >= startOfToday && leadDate < new Date(startOfToday.getTime() + 86400000);
        } else if (reportType === 'Yesterday') {
          matchesDate = leadDate >= new Date(startOfToday.getTime() - 86400000) && leadDate < startOfToday;
        } else if (reportType === 'This Week') {
          matchesDate = leadDate >= startOfWeek && leadDate < new Date(startOfWeek.getTime() + 7 * 86400000);
        } else if (reportType === 'This Month') {
          matchesDate = leadDate >= startOfMonth && leadDate < new Date(now.getFullYear(), now.getMonth() + 1, 1);
        }
      }
      return matchesStatus && matchesSource && matchesDate;
    });
  }, [leads, reportType, statusFilter, primarySources]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reportRows;
    return reportRows.filter((l) =>
      [l.name, l.mobile, l.primarySource, l.ownerName, l.owner]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [reportRows, search]);

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

  useEffect(() => { setPage(1); }, [search, pageSize, reportType, statusFilter, primarySources, filtered]);

  const themed = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    titleBar: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, paddingBottom: spacing.sm },
    title: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    body: { flex: 1, paddingHorizontal: spacing.screenH, paddingBottom: spacing.md },

    filtersCard: {
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      gap: 12,
      marginBottom: spacing.md,
    },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    filterLabel: { width: 96, color: colors.text.secondary, fontSize: typography.size.xs, fontWeight: '600' },
    filterControl: { flex: 1 },
    checkboxRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    checkboxItem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 6 },
    checkbox: {
      width: 15, height: 15, borderRadius: 3, borderWidth: 1.5,
      borderColor: colors.text.muted, alignItems: 'center', justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
    checkboxLabel: { color: colors.text.primary, fontSize: typography.size.xs },

    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.bg.secondary,
      borderRadius: 22, borderWidth: 1, borderColor: colors.border.default,
      paddingHorizontal: spacing.md, height: 42, flex: 1,
    },
    searchText: { flex: 1, color: colors.text.primary, fontSize: typography.size.base },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },

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
    checkboxLg: {
      width: 17, height: 17, borderRadius: 4, borderWidth: 1.5,
      borderColor: colors.text.muted, alignItems: 'center', justifyContent: 'center',
    },
    checkboxLgOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
    remarkBtn: {
      width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.bg.tertiary, alignSelf: 'center',
    },
    actionBtn: {
      width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.bg.tertiary,
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

    emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 8, width: '100%' },
    emptyTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '600' },
    emptyHint: { color: colors.text.muted, fontSize: typography.size.sm, textAlign: 'center' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: colors.bg.secondary,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: spacing.lg, paddingBottom: 34,
    },
    modalTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
    logTitle: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    logSub: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
    logDate: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 4 },
    mutedText: { color: colors.text.muted, fontSize: typography.size.sm },
  });

  const statusTone = (status) => {
    const tone = isDark ? DARK_TONE[status] : STATUS_TONE[status];
    return tone || (isDark ? { bg: '#1E293B', text: '#94A3B8' } : { bg: '#EEF0F4', text: '#64748B' });
  };

  const CheckBox = ({ on, onPress, small }) => (
    <TouchableOpacity
      style={[small ? themed.checkbox : themed.checkboxLg, on && (small ? themed.checkboxOn : themed.checkboxLgOn)]}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {on ? <Feather name="check" size={small ? 10 : 12} color="#fff" /> : null}
    </TouchableOpacity>
  );

  const renderCell = (lead, col) => {
    switch (col.key) {
      case 'name':
        return (
          <Text style={[themed.cell, themed.cellStrong, { width: col.width }]} numberOfLines={1}>
            {lead.name || '—'}
          </Text>
        );
      case 'mobile':
        return (
          <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
            {formatMobile(lead.mobile)}
          </Text>
        );
      case 'primarySource':
        return (
          <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
            {lead.primarySource || '—'}
          </Text>
        );
      case 'status': {
        const status = lead.status || '';
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
      case 'owner':
        return (
          <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
            {lead.ownerName || lead.owner || '—'}
          </Text>
        );
      case 'callRemarks':
        return (
          <View style={{ width: col.width, alignItems: 'center' }}>
            <TouchableOpacity
              style={themed.remarkBtn}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              onPress={() => setRemarksLead(lead)}
            >
              <Feather name="message-square" size={13} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
        );
      case 'updatedAt':
        return (
          <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
            {formatReportDate(lead.updatedAt)}
          </Text>
        );
      case 'createdAt':
        return (
          <Text style={[themed.cell, themed.cellMuted, { width: col.width }]} numberOfLines={1}>
            {formatReportDate(lead.createdAt)}
          </Text>
        );
      default:
        return null;
    }
  };

  /* Latest log first — the web modal shows only the newest one. */
  const latestLog = useMemo(() => {
    if (!remarksLead) return null;
    const logs = remarksLead.logs ? [...remarksLead.logs].sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
    return logs[0] || null;
  }, [remarksLead]);

  const statusSelectValue = statusFilter || 'All Statuses';

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation?.openDrawer?.()} />

      <View style={themed.titleBar}>
        <Text style={themed.title}>Export Report</Text>
      </View>

      <View style={themed.body}>
        {/* Filters card */}
        <View style={themed.filtersCard}>
          <View style={themed.filterRow}>
            <Text style={themed.filterLabel}>Report Type:</Text>
            <View style={themed.filterControl}>
              <SelectField
                value={reportType}
                options={REPORT_TYPES}
                onSelect={setReportType}
                placeholder="Report Type"
              />
            </View>
          </View>

          <View style={[themed.filterRow, { alignItems: 'flex-start' }]}>
            <Text style={[themed.filterLabel, { paddingTop: 12 }]}>Primary Source:</Text>
            <View style={themed.checkboxRow}>
              {SOURCE_KEYS.map((source) => (
                <TouchableOpacity
                  key={source}
                  style={themed.checkboxItem}
                  activeOpacity={0.7}
                  onPress={() => setPrimarySources((prev) => ({ ...prev, [source]: !prev[source] }))}
                >
                  <CheckBox small on={primarySources[source]} onPress={() => setPrimarySources((prev) => ({ ...prev, [source]: !prev[source] }))} />
                  <Text style={themed.checkboxLabel}>{source}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={themed.filterRow}>
            <Text style={themed.filterLabel}>Status:</Text>
            <View style={themed.filterControl}>
              <SelectField
                value={statusSelectValue}
                options={STATUS_OPTIONS.map((s) => (s === '' ? 'All Statuses' : s))}
                onSelect={(v) => setStatusFilter(v === 'All Statuses' ? '' : v)}
                placeholder="All Statuses"
              />
            </View>
          </View>
        </View>

        {/* Search + toolbar */}
        <View style={themed.searchRow}>
          <View style={themed.searchWrap}>
            <Feather name="search" size={15} color={colors.text.muted} />
            <TextInput
              style={themed.searchText}
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, phone, source or owner..."
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
            fields={[
              { key: 'primarySource', label: 'Primary Source' },
              { key: 'status', label: 'Status' },
              { key: 'owner', label: 'Owner', getValue: (r) => r.ownerName || r.owner },
            ]}
            rows={searched}
            visibleColumns={visibleColumns}
            hidden={hidden}
            onToggleColumn={toggleColumn}
            onFiltered={setFiltered}
            exportName="lead-report"
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

                <ScrollView style={{ height: 380 }} nestedScrollEnabled showsVerticalScrollIndicator>
                  {paged.map((lead, index) => {
                    const rowNo = (currentPage - 1) * pageSize + index + 1;
                    return (
                      <View key={String(lead.id || index)} style={themed.row}>
                        <View style={themed.checkCol}>
                          <CheckBox on={selected.has(String(lead.id))} onPress={() => toggleRow(String(lead.id))} />
                        </View>
                        <Text style={themed.slNoCell}>{rowNo}</Text>
                        {visibleColumns.map((col) => (
                          <View key={col.key}>{renderCell(lead, col)}</View>
                        ))}
                        <View style={{ width: ACTIONS_WIDTH, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
                          <TouchableOpacity
                            style={themed.actionBtn}
                            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                            onPress={() => setRemarksLead(lead)}
                          >
                            <Feather name="eye" size={13} color={colors.text.muted} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={themed.actionBtn}
                            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                            onPress={() => setRemarksLead(lead)}
                          >
                            <Feather name="edit-2" size={13} color={colors.text.muted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                  {total === 0 && (
                    <View style={themed.emptyWrap}>
                      <Feather name="inbox" size={28} color={colors.text.muted} />
                      <Text style={themed.emptyTitle}>No data available</Text>
                      <Text style={themed.emptyHint}>Adjust the report filters above to see results.</Text>
                    </View>
                  )}
                </ScrollView>

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

      {/* Lead Logs modal (web's View Remarks) */}
      <Modal visible={!!remarksLead} transparent animationType="slide" onRequestClose={() => setRemarksLead(null)}>
        <TouchableOpacity style={themed.modalBackdrop} activeOpacity={1} onPress={() => setRemarksLead(null)}>
          <TouchableOpacity activeOpacity={1} style={themed.modalSheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Text style={themed.modalTitle}>Lead Logs</Text>
              <TouchableOpacity onPress={() => setRemarksLead(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            {latestLog ? (
              <View>
                <Text style={themed.logTitle}>{latestLog.title}</Text>
                {latestLog.subtitle ? (
                  <Text style={themed.logSub}>{String(latestLog.subtitle).replace('by admin ', '')}</Text>
                ) : null}
                <Text style={themed.logDate}>on {formatReportDate(latestLog.date)}</Text>
              </View>
            ) : (
              <Text style={themed.mutedText}>No logs available.</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: { height: 200, alignItems: 'center', justifyContent: 'center' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  pickerSheet: { width: 200, borderRadius: 12, borderWidth: 1, overflow: 'hidden', elevation: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.18)' },
  pickerText: { fontSize: 13 },
});
