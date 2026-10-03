import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Text,
  TouchableOpacity, Modal, TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { leadsService } from '../../services/leads';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import TabStrip from '../../components/TabStrip';
import ListToolbar from '../../components/ListToolbar';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

/* Columns — the web Enquiry table's set. */
const COLUMNS = [
  { key: 'name',          label: 'Company Name', width: 140, exportValue: (r) => r.companyName || r.name || '' },
  { key: 'mobile',        label: 'Contact',      width: 132, exportValue: (r) => r.mobileNumber || r.mobile || '' },
  { key: 'primarySource', label: 'Source',       width: 108, exportValue: (r) => r.primarySource || '' },
  { key: 'project',       label: 'Projects',     width: 128, exportValue: (r) => r.project || '' },
  { key: 'owner',         label: 'Owner',        width: 108, exportValue: (r) => r.ownerName || r.owner || '' },
  { key: 'status',        label: 'Status',       width: 104, exportValue: (r) => r.status || '' },
];

const SL_NO_WIDTH = 48;
const ACTIONS_WIDTH = 76;

const FILTER_FIELDS = [
  { key: 'project',       label: 'Project' },
  { key: 'primarySource', label: 'Primary Source' },
  { key: 'status',        label: 'Status' },
  { key: 'owner',         label: 'Owner', getValue: (r) => r.ownerName || r.owner },
];

/* Tab slicing — the same rules as the web Leads page: a lead with a
   dedicated tab belongs there and nowhere else, so counts add up. */
const DEDICATED_TAB = {
  'Site Visit': 'Site Visit',
  Duplicate: 'Duplicate Leads',
  'Possible Duplicate': 'Duplicate Leads',
  Rejected: 'Rejected Leads',
};

const STATUS_BADGE = {
  'New Lead':      { bg: '#1E293B', text: '#38BDF8' },
  New:             { bg: '#1E293B', text: '#38BDF8' },
  Open:            { bg: '#1C3349', text: '#60A5FA' },
  Qualified:       { bg: '#1A2E22', text: '#34D399' },
  Opportunity:     { bg: '#1A2E22', text: '#34D399' },
  'Site Visit':    { bg: '#2D2416', text: '#FBBF24' },
  Duplicate:       { bg: '#2D2416', text: '#FBBF24' },
  'Possible Duplicate': { bg: '#2D2416', text: '#FBBF24' },
  Rejected:        { bg: '#2D1B1B', text: '#F87171' },
  Won:             { bg: '#14281A', text: '#10B981' },
  Lost:            { bg: '#2D1B1B', text: '#F87171' },
};

function ownerOf(lead) {
  return lead.ownerName || lead.owner || '';
}

function formatMobile(m) {
  if (!m) return '';
  const s = String(m).replace(/[^\d+]/g, '');
  return s.length > 10 ? s.slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2') : s;
}

export default function LeadsScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const loggedInUser = user?.username || user?.name || '';

  const [leads, setLeads]           = useState([]);
  const [search, setSearch]         = useState('');
  const [activeTab, setActiveTab]   = useState('All Leads');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [hidden, setHidden]         = useState([]);
  const [filtered, setFiltered]     = useState(null);
  const searchTimer                 = useRef(null);

  /* ---- fetch ---- */
  const fetchLeads = useCallback(async (q = search, reset = true) => {
    try {
      const res = await leadsService.getLeads({ page: 1, limit: 200, search: q });
      const items = Array.isArray(res) ? res : (res?.leads || res?.data || []);
      setLeads(items);
    } catch (e) {
      console.error('Leads fetch error', e?.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchLeads('', true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setLoading(true);
      fetchLeads(search, true);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = () => { setRefreshing(true); fetchLeads(search, true); };

  /* ---- tabs (web rules) ---- */
  const tabNames = useMemo(
    () => ['All Leads', 'Our Leads', 'Duplicate Leads', 'Rejected Leads', 'Site Visit', 'Follow Up'],
    []
  );

  const matchesTab = useCallback((lead, tab) => {
    const ownTab = DEDICATED_TAB[lead.status];
    if (ownTab) return tab === ownTab;

    switch (tab) {
      case 'All Leads':
      case 'All': return true;
      case 'Our Leads': return ownerOf(lead) === loggedInUser;
      case 'Duplicate Leads':
      case 'Rejected Leads':
      case 'Site Visit': return false; // handled by dedicated tab
      case 'Follow Up': return Boolean(lead.followUpDate || lead.followUp);
      default: return true;
    }
  }, [loggedInUser]);

  const tabs = useMemo(() => tabNames.map((name) => ({
    id: name,
    label: name,
    count: leads.filter((l) => matchesTab(l, name)).length,
  })), [tabNames, leads, matchesTab]);

  const tabbed = useMemo(
    () => leads.filter((l) => matchesTab(l, activeTab)),
    [leads, activeTab, matchesTab]
  );

  const visibleColumns = useMemo(() => COLUMNS.filter((c) => !hidden.includes(c.key)), [hidden]);
  const tableWidth = SL_NO_WIDTH + visibleColumns.reduce((s, c) => s + c.width, 0) + ACTIONS_WIDTH;

  const toggleColumn = (key) => {
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const rows = filtered ?? tabbed;

  /* ---- themed styles ---- */
  const themed = StyleSheet.create({
    root:   { flex: 1, backgroundColor: colors.bg.primary },
    titleBar: {
      paddingHorizontal: spacing.screenH,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.bg.primary,
    },
    title:    { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    subtitle: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: spacing.screenH,
      paddingBottom: spacing.sm,
      backgroundColor: colors.bg.primary,
    },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.secondary,
    },
    btnPrimary: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    btnText:        { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    btnTextPrimary: { color: '#FFFFFF', fontSize: typography.size.sm, fontWeight: '600' },

    body:  { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
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
    nameCell: { fontWeight: '600' },
    emptyWrap: { alignItems: 'center', paddingVertical: 64, gap: 8, width: '100%' },
    emptyTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '600' },
    emptyHint: { color: colors.text.muted, fontSize: typography.size.sm, textAlign: 'center' },
  });

  const cellText = (item, col) => {
    if (col.key === 'name')   return item.companyName || item.name || item.fullName || '—';
    if (col.key === 'mobile') return formatMobile(item.mobileNumber || item.mobile) || '—';
    if (col.key === 'owner')  return ownerOf(item) || '—';
    return item[col.key] || '—';
  };

  const renderCell = (item, col) => {
    if (col.key === 'status') {
      const status = item.status || 'New';
      const badge = STATUS_BADGE[status] || STATUS_BADGE.New;
      return (
        <Text style={[themed.statusPill, { width: col.width - 16, backgroundColor: badge.bg, color: badge.text }]} numberOfLines={1}>
          {status}
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
      onPress={() => navigation.navigate('LeadDetail', { id: item.id, name: item.companyName || item.name || item.fullName })}
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

      {/* Title + actions — as the web Page header */}
      <View style={themed.titleBar}>
        <Text style={themed.title}>Enquiry Lists</Text>
        <Text style={themed.subtitle}>View and manage all customer enquiries and their current status.</Text>
      </View>
      <View style={themed.actionsRow}>
        <TouchableOpacity style={themed.btn} activeOpacity={0.8} onPress={() => navigation.navigate('ImportLeads')}>
          <Feather name="upload" size={14} color={colors.text.primary} />
          <Text style={themed.btnText}>Import</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[themed.btn, themed.btnPrimary]} activeOpacity={0.8} onPress={() => setCreateOpen(true)}>
          <Feather name="plus" size={14} color="#FFFFFF" />
          <Text style={themed.btnTextPrimary}>Create Lead</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs with counts */}
      <TabStrip tabs={tabs} activeTab={activeTab} onChange={(t) => { setActiveTab(t); setFiltered(null); }} />

      <View style={themed.body}>
        {/* Search */}
        <View style={themed.searchWrap}>
          <Feather name="search" size={15} color={colors.text.muted} />
          <TextInput
            style={themed.searchText}
            value={search}
            onChangeText={setSearch}
            placeholder="Search company, contact, project or owner..."
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
            rows={tabbed}
            visibleColumns={visibleColumns}
            hidden={hidden}
            onToggleColumn={toggleColumn}
            onFiltered={setFiltered}
            exportName="leads"
          />
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.brand.primary} />
          </View>
        ) : (
          <View style={themed.tableWrap}>
            {/* Header + rows share one horizontal scroll so columns stay aligned */}
            <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
              <View style={{ width: tableWidth }}>
                {/* Column header row */}
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
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
                  }
                  ListEmptyComponent={
                    <View style={themed.emptyWrap}>
                      <Feather name="inbox" size={28} color={colors.text.muted} />
                      <Text style={themed.emptyTitle}>No enquiries found</Text>
                      <Text style={themed.emptyHint}>Create a lead or import a list to get started.</Text>
                    </View>
                  }
                  showsVerticalScrollIndicator={false}
                />
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      {/* Create Lead modal */}
      <CreateLeadModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false);
          fetchLeads(search, true);
          const own = DEDICATED_TAB[created?.status];
          setActiveTab(own || 'All Leads');
        }}
      />
    </View>
  );
}

/* ---- Create Lead modal (web's Create New Lead form) ---- */
function CreateLeadModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [projects, setProjects]     = useState([]);
  const [primarySources, setPrimary] = useState([]);
  const [secondarySources, setSecondary] = useState([]);
  const [tertiarySources, setTertiary] = useState([]);

  const [form, setForm] = useState({
    project: '', fullName: '', email: '', mobile: '',
    primarySource: '', secondarySource: '', tertiarySource: '',
  });
  const set = (key) => (v) => setForm((prev) => ({ ...prev, [key]: v }));

  useEffect(() => {
    if (!visible) return;
    leadsService.getOptions('/projects', 'projectName').then(setProjects).catch(() => {});
    leadsService.getOptions('/primary-sources', 'sourceName').then(setPrimary).catch(() => {});
    leadsService.getOptions('/secondary-sources', 'sourceName').then(setSecondary).catch(() => {});
    leadsService.getOptions('/tertiary-sources', 'sourceName').then(setTertiary).catch(() => {});
  }, [visible]);

  const valid = form.project && form.fullName && form.email && form.mobile && form.primarySource;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const created = await leadsService.createLead({
        name: form.fullName,
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile,
        primarySource: form.primarySource,
        secondarySource: form.secondarySource,
        tertiarySource: form.tertiarySource,
        project: form.project,
        status: 'New Lead',
        owner: user?.username || user?.name || '',
      });
      onCreated(created);
      setForm({ project: '', fullName: '', email: '', mobile: '', primarySource: '', secondarySource: '', tertiarySource: '' });
    } catch (e) {
      console.error('Create lead failed', e?.response?.data || e.message);
    } finally {
      setSaving(false);
    }
  };

  const themed = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg.secondary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '88%',
      paddingBottom: 24,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    title: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
    desc:  { color: colors.text.muted, fontSize: typography.size.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    body:  { paddingHorizontal: spacing.lg },
    label: { color: colors.text.secondary, fontSize: typography.size.xs, fontWeight: '600', marginBottom: 6 },
    input: {
      backgroundColor: colors.bg.tertiary,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text.primary,
      fontSize: typography.size.sm,
      marginBottom: spacing.md,
    },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
    chip: {
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.tertiary,
    },
    chipActive: { backgroundColor: colors.brand.primary + '26', borderColor: colors.brand.primary },
    chipText: { color: colors.text.secondary, fontSize: typography.size.xs },
    chipTextActive: { color: colors.brand.primary, fontWeight: '600' },
    createBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: 12,
      alignItems: 'center',
      paddingVertical: 14,
      marginTop: spacing.sm,
    },
    createBtnDisabled: { opacity: 0.5 },
    createBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.size.base },
  });

  const ChipPicker = ({ label, options, value, onSelect }) => (
    <View>
      <Text style={themed.label}>{label}</Text>
      <View style={themed.chipWrap}>
        {(options || []).map((opt) => (
          <TouchableOpacity key={opt} style={[themed.chip, value === opt && themed.chipActive]} onPress={() => onSelect(opt)}>
            <Text style={[themed.chipText, value === opt && themed.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={themed.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={themed.sheet}>
          <View style={themed.head}>
            <Text style={themed.title}>Create New Lead</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
          <Text style={themed.desc}>Capture a new enquiry and assign it to yourself.</Text>

          <ScrollView style={themed.body} keyboardShouldPersistTaps="handled">
            <Text style={themed.label}>Project Interested *</Text>
            <View style={themed.chipWrap}>
              {projects.map((p) => (
                <TouchableOpacity key={p} style={[themed.chip, form.project === p && themed.chipActive]} onPress={() => set('project')(p)}>
                  <Text style={[themed.chipText, form.project === p && themed.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={themed.label}>Full Name *</Text>
            <TextInput style={themed.input} value={form.fullName} onChangeText={set('fullName')} placeholder="Full Name" placeholderTextColor={colors.text.muted} />

            <Text style={themed.label}>Email Address *</Text>
            <TextInput style={themed.input} value={form.email} onChangeText={set('email')} placeholder="name@example.com" placeholderTextColor={colors.text.muted} autoCapitalize="none" keyboardType="email-address" />

            <Text style={themed.label}>Mobile Number *</Text>
            <TextInput style={themed.input} value={form.mobile} onChangeText={set('mobile')} placeholder="Mobile number" placeholderTextColor={colors.text.muted} keyboardType="phone-pad" />

            <ChipPicker label="Primary Source *" options={primarySources} value={form.primarySource} onSelect={set('primarySource')} />
            {form.primarySource ? (
              <ChipPicker label="Secondary Source" options={secondarySources} value={form.secondarySource} onSelect={set('secondarySource')} />
            ) : null}
            {form.secondarySource ? (
              <ChipPicker label="Tertiary Source" options={tertiarySources} value={form.tertiarySource} onSelect={set('tertiarySource')} />
            ) : null}

            <TouchableOpacity
              style={[themed.createBtn, !valid && themed.createBtnDisabled]}
              disabled={!valid || saving}
              onPress={submit}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={themed.createBtnText}>Create Lead</Text>}
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loadingRow: { height: 160, alignItems: 'center', justifyContent: 'center' },
});
