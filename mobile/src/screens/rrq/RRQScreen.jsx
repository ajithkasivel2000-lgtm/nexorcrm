import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Modal, ScrollView, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { rrqService } from '../../services/rrq';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import SelectField from '../../components/SelectField';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* Types the lead-routing code depends on by name — the web hides delete for
   these, and so do we. Keep in step with backend/utils/rrqTypes.js. */
const RESERVED_TYPES = ['presales', 'sales'];

const EMPTY_FORM = { projectName: '', rrqName: '', rrqType: '', assignedUsers: [] };

/**
 * RRQ — the mobile twin of the web RRQ page: queues table/list with type
 * tabs, search, create/edit sheet (project, name, type, assigned users).
 */
export default function RRQScreen({ navigation }) {
  const { colors } = useTheme();
  const [data, setData] = useState([]);
  const [users, setUsers] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [rrqTypes, setRrqTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  /* Create / edit sheet */
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [rows, userList] = await Promise.all([
        rrqService.getRRQs(),
        rrqService.getUsers().catch(() => []),
      ]);
      setData(Array.isArray(rows) ? rows : []);
      setUsers(userList);
    } catch (e) {
      console.error('Failed to load RRQs:', e?.response?.data?.message || e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  /* Load dropdown options when the create sheet opens. */
  const openCreate = async () => {
    setEditRow(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
    try {
      const [projects, types] = await Promise.all([
        rrqService.getProjects().catch(() => []),
        rrqService.getTypes().catch(() => []),
      ]);
      setProjectsList(projects);
      setRrqTypes(types);
    } catch { /* the selects still show what we have */ }
  };

  const openEdit = (rrq) => {
    setEditRow(rrq);
    setForm({
      projectName: rrq.projectName || '',
      rrqName: rrq.rrqName || '',
      rrqType: rrq.rrqType || '',
      assignedUsers: [...(rrq.assignedUsers || [])],
    });
    setFormError('');
    setFormOpen(true);
    // Make sure the dropdowns have options even on a cold open.
    if (projectsList.length === 0 || rrqTypes.length === 0) {
      Promise.all([
        rrqService.getProjects().catch(() => []),
        rrqService.getTypes().catch(() => []),
      ]).then(([projects, types]) => {
        setProjectsList(projects);
        setRrqTypes(types);
      });
    }
  };

  /* assignedUsers holds user ids; show usernames instead. Falls back to the
     raw id when a user has since been deleted — same as web. */
  const usernameFor = useCallback((uid) => {
    const u = users.find((x) => x.id === uid);
    return u ? (u.username || u.name || uid) : uid;
  }, [users]);

  const submit = async () => {
    if (!form.projectName || !form.rrqName.trim() || !form.rrqType) {
      setFormError('Project, RRQ Name and RRQ Type are all required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editRow) {
        await rrqService.updateRRQ(editRow.id, {
          projectName: form.projectName,
          rrqName: form.rrqName.trim(),
          rrqType: form.rrqType,
          assignedUsers: form.assignedUsers,
        });
      } else {
        await rrqService.createRRQ({
          projectName: form.projectName,
          rrqName: form.rrqName.trim(),
          rrqType: form.rrqType,
          ...(form.assignedUsers.length ? { assignedUsers: form.assignedUsers } : {}),
        });
      }
      setFormOpen(false);
      loadData();
    } catch (e) {
      const msg = e?.response?.data?.message || 'Failed to save RRQ.';
      // An orphaned project name comes back with the names that do exist.
      const alt = e?.response?.data?.projects;
      setFormError(alt?.length ? `${msg} Existing projects: ${alt.join(', ')}` : msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = (uid) => {
    setForm((prev) => ({
      ...prev,
      assignedUsers: prev.assignedUsers.includes(uid)
        ? prev.assignedUsers.filter((u) => u !== uid)
        : [...prev.assignedUsers, uid],
    }));
  };

  /* Users offered for assignment — the superadmin stays assignable through
     an existing queue but is not newly offered, like web's withoutSuperAdmin. */
  const assignableUsers = useMemo(
    () => users.filter((u) => !RESERVED_TYPES.includes('') && u.username !== 'admin'),
    [users]
  );

  const tabs = useMemo(() => {
    const counts = new Map();
    for (const item of data) {
      const v = item.rrqType;
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [
      { id: 'All', label: 'All', count: data.length },
      ...[...counts.entries()].sort().map(([label, count]) => ({ id: label, label, count })),
    ];
  }, [data]);

  const filtered = data.filter((item) => {
    if (activeTab !== 'All' && item.rrqType !== activeTab) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (item.rrqName || '').toLowerCase().includes(q) ||
      (item.rrqId || '').toLowerCase().includes(q) ||
      (item.projectName || '').toLowerCase().includes(q)
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
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: spacing.radius.md,
    },
    createBtnText: { color: '#fff', fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
    subtitle: { color: colors.text.muted, fontSize: typography.size.sm },

    tabsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, gap: spacing.sm },
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
    cardTitle: { color: colors.text.primary, fontSize: typography.size.base, fontWeight: typography.weight.bold },
    cardId: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
    typePill: {
      borderWidth: 1, borderColor: colors.brand.primary + '40',
      backgroundColor: colors.brand.primary + '10',
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    },
    typeText: { color: colors.brand.primary, fontSize: 11, fontWeight: '600' },
    missingPill: {
      borderWidth: 1, borderColor: '#EF444455', backgroundColor: '#EF444414',
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginLeft: 6,
    },
    missingText: { color: '#EF4444', fontSize: 11, fontWeight: '600' },

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

    emptyText: { textAlign: 'center', color: colors.text.muted, marginTop: 40, fontSize: typography.size.sm },

    /* Form sheet */
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg.secondary,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '88%', paddingBottom: 30,
    },
    sheetHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs,
    },
    sheetTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
    sheetBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
    fieldLabel: { color: colors.text.secondary, fontSize: typography.size.xs, fontWeight: '600', marginTop: 10, marginBottom: 4 },
    input: {
      borderWidth: 1, borderColor: colors.border.default, borderRadius: 8,
      backgroundColor: colors.bg.tertiary, paddingHorizontal: 12,
      color: colors.text.primary, height: 42, fontSize: typography.size.sm,
    },
    userRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
    },
    userCheck: {
      width: 17, height: 17, borderRadius: 4, borderWidth: 1.5,
      borderColor: colors.text.muted, alignItems: 'center', justifyContent: 'center',
    },
    userCheckOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
    userName: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    userSub: { color: colors.text.muted, fontSize: 10 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: colors.brand.primary + '14',
      borderWidth: 1, borderColor: colors.brand.primary + '44',
      borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
    },
    chipText: { color: colors.brand.primary, fontSize: 11, fontWeight: '600' },
    errorText: { color: '#EF4444', fontSize: typography.size.xs, marginTop: 8 },
    submitBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 9,
      paddingVertical: 12, alignItems: 'center', marginTop: 16,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitText: { color: '#fff', fontSize: typography.size.sm, fontWeight: '600' },
  });

  const renderItem = ({ item }) => (
    <View style={themed.card}>
      <View style={themed.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={themed.cardTitle} numberOfLines={1}>{item.rrqName || '—'}</Text>
          <Text style={themed.cardId}>{item.rrqId}</Text>
        </View>
        <View style={themed.typePill}>
          <Text style={themed.typeText}>{item.rrqType || 'Queue'}</Text>
        </View>
        {item.projectMissing ? (
          <View style={themed.missingPill}>
            <Text style={themed.missingText}>Project missing</Text>
          </View>
        ) : null}
      </View>

      <View style={themed.infoRow}>
        <Feather name="layout" size={14} color={colors.text.muted} />
        <Text style={themed.infoText} numberOfLines={1}>{item.projectName || '—'}</Text>
      </View>

      <View style={themed.infoRow}>
        <Feather name="users" size={14} color={colors.text.muted} />
        <Text style={themed.infoText} numberOfLines={2}>
          {item.assignedUsers?.length ? item.assignedUsers.map(usernameFor).join(', ') : 'No users assigned'}
        </Text>
      </View>

      <View style={themed.footer}>
        <View style={themed.dateCol}>
          <Text style={themed.dateLabel}>Created</Text>
          <Text style={themed.dateValue}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={themed.dateCol}>
          <Text style={themed.dateLabel}>Updated</Text>
          <Text style={themed.dateValue}>{formatDate(item.updatedAt)}</Text>
        </View>
        <TouchableOpacity style={themed.editBtn} activeOpacity={0.7} onPress={() => openEdit(item)}>
          <Feather name="edit-2" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation?.openDrawer?.()} />

      <View style={themed.header}>
        <View style={themed.titleRow}>
          <Text style={themed.title}>RRQ</Text>
          <TouchableOpacity style={themed.createBtn} activeOpacity={0.8} onPress={openCreate}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={themed.createBtnText}>Create RRQ</Text>
          </TouchableOpacity>
        </View>
        <Text style={themed.subtitle}>Create, view and edit RRQ. Assign users to RRQ.</Text>

        <View style={themed.tabsWrap}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              activeOpacity={0.7}
              style={[themed.tabBtn, activeTab === tab.id && themed.tabBtnActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[themed.tabText, activeTab === tab.id && themed.tabTextActive]}>{tab.label}</Text>
              <View style={themed.badge}><Text style={themed.badgeText}>{tab.count}</Text></View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={themed.searchRow}>
          <View style={themed.searchWrap}>
            <Feather name="search" size={16} color={colors.text.muted} />
            <TextInput
              style={themed.searchInput}
              placeholder="Search RRQ name, type or project..."
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
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={themed.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
          ListEmptyComponent={<Text style={themed.emptyText}>No RRQs found.</Text>}
        />
      )}

      {/* Add / Edit RRQ sheet — web's modal with the same fields */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <TouchableOpacity style={themed.backdrop} activeOpacity={1} onPress={() => setFormOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={themed.sheet}>
            <View style={themed.sheetHead}>
              <Text style={themed.sheetTitle}>{editRow ? 'Edit RRQ' : 'Add RRQ'}</Text>
              <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={themed.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={themed.fieldLabel}>Project Interested *:</Text>
              <SelectField
                value={form.projectName}
                options={projectsList}
                onSelect={(v) => setForm((prev) => ({ ...prev, projectName: v }))}
                placeholder={projectsList.length ? 'Select Project' : 'Loading projects…'}
              />

              <Text style={themed.fieldLabel}>RRQ Name *:</Text>
              <TextInput
                style={themed.input}
                value={form.rrqName}
                onChangeText={(v) => setForm((prev) => ({ ...prev, rrqName: v }))}
                placeholder="Enter RRQ Name"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={themed.fieldLabel}>RRQ Type *:</Text>
              <SelectField
                value={form.rrqType}
                options={rrqTypes}
                onSelect={(v) => setForm((prev) => ({ ...prev, rrqType: v }))}
                placeholder={rrqTypes.length ? 'Select RRQ Type' : 'Loading types…'}
              />

              <Text style={themed.fieldLabel}>Add Users:</Text>
              {assignableUsers.length === 0 ? (
                <Text style={themed.errorText}>No other users have accounts yet.</Text>
              ) : (
                <>
                  {assignableUsers.map((u) => {
                    const picked = form.assignedUsers.includes(u.id);
                    return (
                      <TouchableOpacity key={u.id} style={themed.userRow} activeOpacity={0.7} onPress={() => toggleUser(u.id)}>
                        <View style={[themed.userCheck, picked && themed.userCheckOn]}>
                          {picked ? <Feather name="check" size={11} color="#fff" /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={themed.userName}>{u.username}</Text>
                          {u.name !== u.username ? <Text style={themed.userSub}>{u.name}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {form.assignedUsers.length > 0 ? (
                <View style={themed.chipsWrap}>
                  {form.assignedUsers.map((uid) => (
                    <TouchableOpacity key={uid} style={themed.chip} activeOpacity={0.75} onPress={() => toggleUser(uid)}>
                      <Text style={themed.chipText}>{usernameFor(uid)}</Text>
                      <Feather name="x" size={11} color={colors.brand.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {formError ? <Text style={themed.errorText}>{formError}</Text> : null}

              <TouchableOpacity
                style={[themed.submitBtn, saving && themed.submitBtnDisabled]}
                disabled={saving}
                onPress={submit}
              >
                <Text style={themed.submitText}>
                  {saving ? 'Saving…' : editRow ? 'Save Changes' : 'Add RRQ'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
