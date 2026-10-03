import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Platform, Modal, Alert, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '../../services/emailTemplates';

const COLORS = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  brand: '#4F46E5', // Matches screenshot purple-ish blue
  white: '#FFFFFF',
  danger: '#EF4444',
  success: '#22C55E'
};

const SYSTEM_TEMPLATE_KEYS = [
  'CREATE_NEW_LEAD_TEMPLATE',
  'SITE_VISIT_SCHEDULED_TEMPLATE',
  'LEAD_CONVERTED_TO_OPPORTUNITY_TEMPLATE',
  'LEAD_REASSIGNED_TEMPLATE',
];

const isSystemTemplate = (key) => {
  return SYSTEM_TEMPLATE_KEYS.includes(String(key || '').trim().toUpperCase());
};

export default function EmailTemplatesScreen() {
  const navigation = useNavigation();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All'); // All, Custom, System
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ id: null, name: '', subject: '', bodyContent: '', status: true, templateKey: '', type: 'Custom' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getEmailTemplates();
      setTemplates(data);
    } catch (e) {
      console.error('Error loading templates:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTemplates = templates.filter(t => {
    const computedType = isSystemTemplate(t.templateKey) ? 'System' : 'Custom';
    if (activeTab !== 'All' && computedType !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name?.toLowerCase().includes(q) || t.templateKey?.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSave = async () => {
    if (!form.name || !form.subject) {
      Alert.alert('Error', 'Please fill in Name and Subject');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        name: form.name,
        subject: form.subject,
        bodyContent: form.bodyContent,
        status: !!form.status,
        templateKey: form.templateKey || form.name.toUpperCase().replace(/\s+/g, '_') + '_TEMPLATE',
        type: form.type || 'Custom'
      };
      
      if (form.id) {
        await updateEmailTemplate(form.id, payload);
      } else {
        await createEmailTemplate(payload);
      }
      setShowModal(false);
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save template');
    } finally {
      setSaving(false);
    }
  };

  const handleEditPress = (item) => {
    setForm({
      id: item.id,
      name: item.name || '',
      subject: item.subject || '',
      bodyContent: item.bodyContent || '',
      status: !!item.status,
      templateKey: item.templateKey || '',
      type: item.type || 'Custom'
    });
    setShowModal(true);
  };

  const handleDeletePress = (id, isSystem) => {
    if (isSystem) {
      Alert.alert('Cannot Delete', 'System templates cannot be deleted. You can disable them instead.');
      return;
    }
    Alert.alert('Delete Template', 'Are you sure you want to delete this template?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await deleteEmailTemplate(id);
            load();
          } catch (e) {
            Alert.alert('Error', e.response?.data?.message || 'Could not delete template');
          }
        } 
      }
    ]);
  };

  const handleToggleStatus = async (item, newStatus) => {
    try {
      const updatedItem = { ...item, status: newStatus };
      setTemplates(templates.map(t => t.id === item.id ? updatedItem : t)); // optimistic UI
      await updateEmailTemplate(item.id, { status: newStatus });
    } catch (e) {
      load(); // revert on error
      Alert.alert('Error', 'Could not update status');
    }
  };

  const renderTab = (label, count) => {
    const isActive = activeTab === label;
    return (
      <TouchableOpacity 
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
      <Feather name="layout" size={48} color={COLORS.textMuted} style={{ marginBottom: 16 }} />
      <Text style={styles.emptyTitle}>No templates found</Text>
      <Text style={styles.emptySubtitle}>Try adjusting your filters or create a new one.</Text>
    </View>
  );

  const renderItem = ({ item }) => {
    const isSystem = isSystemTemplate(item.templateKey);
    const computedType = isSystem ? 'System' : 'Custom';
    const isActive = !!item.status;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.templateName}>{item.name}</Text>
            <Text style={styles.templateSubject} numberOfLines={2}>{item.subject}</Text>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditPress(item)}>
              <Feather name="edit" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {!isSystem && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeletePress(item.id, isSystem)}>
                <Feather name="trash-2" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.templateKey}>{item.templateKey}</Text>
        </View>
        <View style={styles.cardFooter}>
          <View style={[styles.badge, isSystem ? styles.badgeSystem : styles.badgeCustom]}>
            <Text style={[styles.badgeText, isSystem ? styles.badgeTextSystem : styles.badgeTextCustom]}>{computedType}</Text>
          </View>
          
          <View style={styles.statusToggle}>
            <Switch
              trackColor={{ false: '#CBD5E1', true: '#C7D2FE' }}
              thumbColor={isActive ? COLORS.brand : '#F1F5F9'}
              onValueChange={(val) => handleToggleStatus(item, val)}
              value={isActive}
            />
            <Text style={styles.statusText}>{isActive ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>
      </View>
    );
  };

  const stats = {
    all: templates.length,
    custom: templates.filter(t => !isSystemTemplate(t.templateKey)).length,
    system: templates.filter(t => isSystemTemplate(t.templateKey)).length,
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <Feather name="menu" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Email Templates</Text>
        </View>
        <TouchableOpacity 
          style={styles.createBtn} 
          onPress={() => {
            setForm({ id: null, name: '', subject: '', bodyContent: '', status: true, templateKey: '', type: 'Custom' });
            setShowModal(true);
          }}
        >
          <Feather name="plus" size={14} color={COLORS.white} />
          <Text style={styles.createBtnText}>Add Template</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {renderTab('All', stats.all)}
        {renderTab('Custom', stats.custom)}
        {renderTab('System', stats.system)}
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search template name or key..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
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
          data={filteredTemplates}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          ListEmptyComponent={renderEmptyComponent}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal for Create/Edit */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{form.id ? 'Edit Template' : 'Create Template'}</Text>
                <Text style={styles.modalSubtitle}>Modify the template subject line and body copy</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Template Name</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. Welcome Email" 
                  value={form.name} 
                  onChangeText={t => setForm({...form, name: t})} 
                  editable={form.type !== 'System'} // Cannot change system name
                />
              </View>

              {/* Template key, shown but disabled if system */}
              {form.id && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Template Key</Text>
                  <TextInput 
                    style={[styles.input, { backgroundColor: COLORS.bg }]} 
                    value={form.templateKey} 
                    onChangeText={t => setForm({...form, templateKey: t})} 
                    editable={false}
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Subject</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Subject line of the email" 
                  value={form.subject} 
                  onChangeText={t => setForm({...form, subject: t})} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Body Content</Text>
                <TextInput 
                  style={[styles.input, styles.textArea]} 
                  placeholder="Design your template HTML or plain text here..." 
                  value={form.bodyContent} 
                  onChangeText={t => setForm({...form, bodyContent: t})} 
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.statusToggleContainer}>
                <Text style={styles.label}>Active Status:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                  <Switch
                    trackColor={{ false: '#CBD5E1', true: '#C7D2FE' }}
                    thumbColor={form.status ? COLORS.brand : '#F1F5F9'}
                    onValueChange={(val) => setForm({...form, status: val})}
                    value={form.status}
                  />
                  <View style={[styles.statusPill, form.status ? styles.statusPillActive : styles.statusPillInactive]}>
                    <Text style={form.status ? styles.statusTextActive : styles.statusTextInactive}>
                      {form.status ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.helpText}>Supported template placeholders: {'{{employee_name}}'}, {'{{company_name}}'}</Text>

            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.btnCancel}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.btnSave, saving && { opacity: 0.7 }]} 
                onPress={handleSave} 
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.btnSaveText}>Save Template</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
  },
  menuBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
    marginLeft: 12,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.brand,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6
  },
  createBtnText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 13,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
    gap: 16,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabBtnActive: {
    borderBottomColor: COLORS.brand,
  },
  tabText: {
    fontSize: 14,
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
    fontSize: 11,
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
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  templateSubject: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 6,
  },
  cardBody: {
    marginBottom: 16,
  },
  templateKey: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.bg,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeSystem: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.textSecondary,
  },
  badgeCustom: {
    backgroundColor: COLORS.white,
    borderColor: '#A855F7',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeTextSystem: {
    color: COLORS.textSecondary,
  },
  badgeTextCustom: {
    color: '#A855F7',
  },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  
  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end', // slide up from bottom
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '90%', // fill most of screen
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
  },
  closeBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  modalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.white,
    fontSize: 14,
  },
  textArea: {
    height: 120,
  },
  statusToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusPillActive: {
    backgroundColor: COLORS.brand,
  },
  statusPillInactive: {
    backgroundColor: COLORS.bg,
  },
  statusTextActive: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextInactive: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  helpText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 8,
    marginBottom: 40,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  btnCancelText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  btnSave: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: COLORS.brand,
    minWidth: 100,
    alignItems: 'center',
  },
  btnSaveText: {
    color: COLORS.white,
    fontWeight: '600',
  },
});
