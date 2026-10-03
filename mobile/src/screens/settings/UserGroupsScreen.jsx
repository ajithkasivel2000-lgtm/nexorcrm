import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Platform, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getUserGroups, createUserGroup, updateUserGroup, deleteUserGroup } from '../../services/userGroups';

const COLORS = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  brand: '#1D4ED8',
  white: '#FFFFFF',
  danger: '#EF4444'
};

export default function UserGroupsScreen() {
  const navigation = useNavigation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ id: null, groupName: '', groupLevel: '' });
  const [saving, setSaving] = useState(false);

  // Filter State
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterLevel, setFilterLevel] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getUserGroups();
      setGroups(data);
    } catch (e) {
      console.error('Error loading groups:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredGroups = groups.filter(g => {
    if (filterLevel !== null && g.groupLevel !== filterLevel) return false;
    if (search) {
      return g.groupName?.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const availableLevels = [...new Set(groups.map(g => g.groupLevel))].sort((a, b) => a - b);

  const handleSaveGroup = async () => {
    if (!form.groupName || !form.groupLevel) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        groupName: form.groupName,
        groupLevel: parseInt(form.groupLevel, 10) || 0
      };
      if (form.id) {
        await updateUserGroup(form.id, payload);
      } else {
        await createUserGroup(payload);
      }
      setShowModal(false);
      setForm({ id: null, groupName: '', groupLevel: '' });
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save group');
    } finally {
      setSaving(false);
    }
  };

  const handleEditPress = (item) => {
    setForm({
      id: item.id,
      groupName: item.groupName,
      groupLevel: item.groupLevel?.toString() || '0'
    });
    setShowModal(true);
  };

  const handleDeletePress = (id) => {
    Alert.alert('Delete Group', 'Are you sure you want to delete this group?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await deleteUserGroup(id);
            load();
          } catch (e) {
            Alert.alert('Error', 'Could not delete group. It might be assigned to users.');
          }
        } 
      }
    ]);
  };

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Feather name="inbox" size={48} color={COLORS.textMuted} style={{ marginBottom: 16 }} />
      <Text style={styles.emptyTitle}>No groups yet</Text>
      <Text style={styles.emptySubtitle}>Create a group to organise your users.</Text>
    </View>
  );

  const renderItem = ({ item, index }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{item.groupName.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.groupName}>{item.groupName}</Text>
            <Text style={styles.groupLevel}>Level: {item.groupLevel}</Text>
          </View>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditPress(item)}>
            <Feather name="edit-2" size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeletePress(item.id)}>
            <Feather name="trash-2" size={16} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <View style={styles.metaData}>
          <Feather name="users" size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{item.members?.length || 0} Members</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
          <Feather name="menu" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Groups</Text>
        <TouchableOpacity 
          style={styles.createBtn} 
          onPress={() => {
            setForm({ id: null, groupName: '', groupLevel: '' });
            setShowModal(true);
          }}
        >
          <Text style={styles.createBtnText}>Create Group</Text>
        </TouchableOpacity>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search group name..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={[styles.iconBtn, filterLevel !== null && { borderColor: COLORS.brand, backgroundColor: COLORS.brand + '10' }]} onPress={() => setShowFilterModal(true)}>
          <Feather name="filter" size={16} color={filterLevel !== null ? COLORS.brand : COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn}>
          <Feather name="download" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowFilterModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { paddingBottom: 20 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Filter Groups</Text>
                <Text style={styles.modalSubtitle}>Filter by group level</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.label}>Level</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.createBtn,
                    { borderColor: filterLevel === null ? COLORS.brand : COLORS.border, backgroundColor: filterLevel === null ? COLORS.brand + '14' : COLORS.white }
                  ]}
                  onPress={() => {
                    setFilterLevel(null);
                    setShowFilterModal(false);
                  }}
                >
                  <Text style={{ color: filterLevel === null ? COLORS.brand : COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
                    All Levels
                  </Text>
                </TouchableOpacity>
                {availableLevels.map((lvl) => (
                  <TouchableOpacity
                    key={lvl}
                    style={[
                      styles.createBtn,
                      { borderColor: filterLevel === lvl ? COLORS.brand : COLORS.border, backgroundColor: filterLevel === lvl ? COLORS.brand + '14' : COLORS.white }
                    ]}
                    onPress={() => {
                      setFilterLevel(lvl);
                      setShowFilterModal(false);
                    }}
                  >
                    <Text style={{ color: filterLevel === lvl ? COLORS.brand : COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
                      Level {lvl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* List */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.brand} />
        </View>
      ) : (
        <FlatList 
          data={filteredGroups}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          ListEmptyComponent={renderEmptyComponent}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal for Create/Edit */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{form.id ? 'Edit Group' : 'Create Group'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Group Name *</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. Sales Team" 
                  value={form.groupName} 
                  onChangeText={t => setForm({...form, groupName: t})} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Group Level *</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. 1" 
                  value={form.groupLevel} 
                  onChangeText={t => setForm({...form, groupLevel: t})} 
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.btnCancel}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.btnSave, saving && { opacity: 0.7 }]} 
                onPress={handleSaveGroup} 
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.btnSaveText}>Save</Text>}
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
    flex: 1,
    marginLeft: 12,
  },
  createBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 6,
  },
  createBtnText: {
    color: COLORS.brand,
    fontWeight: '600',
    fontSize: 13,
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
    backgroundColor: COLORS.white,
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
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.brand + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.brand,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  groupLevel: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.bg,
  },
  metaData: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  
  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: 6,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.white,
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
    paddingVertical: 8,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: COLORS.brand,
    minWidth: 80,
    alignItems: 'center',
  },
  btnSaveText: {
    color: COLORS.white,
    fontWeight: '600',
  },
});
