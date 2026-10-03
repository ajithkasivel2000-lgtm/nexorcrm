import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Platform, Modal, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getUsers, createUser, updateUser } from '../../services/users';

const COLORS = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  brand: '#1D4ED8',
  white: '#FFFFFF',
  badge: {
    Admin: '#1D4ED8',
    Employee: '#059669',
    Manager: '#D97706',
    Registered: '#64748B'
  }
};

export default function UserAdminScreen() {
  const navigation = useNavigation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '', password: '', confirmPassword: '', email: '', phoneCountryCode: '+91', phone: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  // Edit User Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({
    username: '', password: '', confirmPassword: '', email: '', phoneCountryCode: '+91', phone: ''
  });
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (e) {
      console.error('Error loading users:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateUser = async () => {
    if (!createForm.username || !createForm.password || !createForm.email) {
      Alert.alert('Error', 'Please fill in all required fields (*)');
      return;
    }
    if (createForm.password !== createForm.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    try {
      setCreating(true);
      await createUser({
        username: createForm.username,
        password: createForm.password,
        email: createForm.email,
        phoneCountryCode: createForm.phoneCountryCode,
        phone: createForm.phone,
      });
      setShowCreateModal(false);
      setCreateForm({ username: '', password: '', confirmPassword: '', email: '', phoneCountryCode: '+91', phone: '' });
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not create user');
    } finally {
      setCreating(false);
    }
  };

  const handleEditPress = (user) => {
    setEditingUserId(user.id);
    setEditForm({
      username: user.username || '',
      password: '',
      confirmPassword: '',
      email: user.email || '',
      phoneCountryCode: user.phoneCountryCode || '+91',
      phone: user.phone || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async () => {
    if (!editForm.username || !editForm.email) {
      Alert.alert('Error', 'Please fill in all required fields (*)');
      return;
    }
    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    try {
      setEditing(true);
      const payload = {
        username: editForm.username,
        email: editForm.email,
        phoneCountryCode: editForm.phoneCountryCode,
        phone: editForm.phone,
      };
      if (editForm.password) {
        payload.password = editForm.password;
      }
      await updateUser(editingUserId, payload);
      setShowEditModal(false);
      setEditingUserId(null);
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update user');
    } finally {
      setEditing(false);
    }
  };

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  const filteredUsers = users.filter(u => {
    if (activeTab !== 'All' && u.status !== activeTab && u.role !== activeTab) return false;
    if (filterStatus && u.status !== filterStatus && u.role !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!u.username?.toLowerCase().includes(s) && !u.email?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const counts = {
    All: users.length,
    Admin: users.filter(u => u.status === 'Admin' || u.role === 'Admin').length,
    Employee: users.filter(u => u.status === 'Employee' || u.role === 'Employee').length,
    Manager: users.filter(u => u.status === 'Manager' || u.role === 'Manager').length,
  };

  const renderTab = (label, value) => {
    const isActive = activeTab === value;
    return (
      <TouchableOpacity 
        style={[styles.tab, isActive && styles.tabActive]}
        onPress={() => setActiveTab(value)}
      >
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
        <View style={[styles.badge, isActive && styles.badgeActive]}>
          <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{counts[value] || 0}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.userName}>{item.username}</Text>
          <Text style={styles.userEmail}>{item.email || 'No email'}</Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: COLORS.badge[item.status] || COLORS.badge.Registered }]}>
          <View style={[styles.statusDot, { backgroundColor: COLORS.badge[item.status] || COLORS.badge.Registered }]} />
          <Text style={[styles.statusText, { color: COLORS.badge[item.status] || COLORS.badge.Registered }]}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.metaData}>
          <Feather name="clock" size={12} color={COLORS.textMuted} />
          <Text style={styles.metaText}>Login: {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleDateString() : 'Never'}</Text>
        </View>
        <View style={styles.metaData}>
          <Feather name="calendar" size={12} color={COLORS.textMuted} />
          <Text style={styles.metaText}>Created: {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}</Text>
        </View>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditPress(item)}>
          <Feather name="edit-2" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
          <Feather name="menu" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Admin</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreateModal(true)}>
          <Text style={styles.createBtnText}>Create User</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <View style={styles.tabsScroll}>
          {renderTab('All', 'All')}
          {renderTab('Admin', 'Admin')}
          {renderTab('Employee', 'Employee')}
          {renderTab('Manager', 'Manager')}
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Search username or email..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity style={[styles.filterBtn, filterStatus && { borderColor: COLORS.brand, backgroundColor: COLORS.brand + '10' }]} onPress={() => setShowFilterModal(true)}>
          <Feather name="filter" size={16} color={filterStatus ? COLORS.brand : COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowFilterModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { paddingBottom: 20 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Filter Users</Text>
                <Text style={styles.modalSubtitle}>Filter users by status</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.label}>Status</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['', 'Admin', 'Employee', 'Manager', 'Registered'].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.createBtn,
                      { borderColor: filterStatus === opt ? COLORS.brand : COLORS.border, backgroundColor: filterStatus === opt ? COLORS.brand + '14' : COLORS.white }
                    ]}
                    onPress={() => {
                      setFilterStatus(opt);
                      setShowFilterModal(false);
                    }}
                  >
                    <Text style={{ color: filterStatus === opt ? COLORS.brand : COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
                      {opt || 'Any Status'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.brand} />
        </View>
      ) : (
        <FlatList 
          data={filteredUsers}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create User Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Create New User</Text>
                <Text style={styles.modalSubtitle}>New accounts start as Registered and need activating before they can sign in.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCreateModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username *</Text>
                <TextInput 
                  style={[styles.input, { borderColor: COLORS.brand }]} 
                  placeholder="e.g. JohnDoe" 
                  value={createForm.username} 
                  onChangeText={t => setCreateForm({...createForm, username: t})} 
                  autoCapitalize="none"
                />
                <Text style={styles.subText}>Minimum 5 characters</Text>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>New Password *</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput 
                      style={styles.passwordInput} 
                      placeholder="Password" 
                      value={createForm.password} 
                      onChangeText={t => setCreateForm({...createForm, password: t})} 
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.subText}>Min 10 characters, with a number and a special character</Text>
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Confirm Password *</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput 
                      style={styles.passwordInput} 
                      placeholder="Confirm password" 
                      value={createForm.confirmPassword} 
                      onChangeText={t => setCreateForm({...createForm, confirmPassword: t})} 
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                      <Feather name={showConfirmPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>E-mail *</Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="name@company.com" 
                    value={createForm.email} 
                    onChangeText={t => setCreateForm({...createForm, email: t})} 
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Mobile Number</Text>
                  <View style={styles.phoneContainer}>
                    <View style={styles.countryCode}>
                      <Text style={{ fontSize: 16 }}>🇮🇳</Text>
                      <Text style={{ marginLeft: 4, color: COLORS.textPrimary }}>+91</Text>
                      <Feather name="chevron-down" size={14} color={COLORS.textSecondary} style={{ marginLeft: 4 }} />
                    </View>
                    <TextInput 
                      style={styles.phoneInput} 
                      placeholder="0000000000" 
                      value={createForm.phone} 
                      onChangeText={t => setCreateForm({...createForm, phone: t})} 
                      keyboardType="numeric"
                    />
                  </View>
                  <Text style={styles.subText}>Optional — used for calls and alerts</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Profile Image</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <View style={styles.avatarPlaceholder}>
                    <Feather name="user" size={24} color={COLORS.textSecondary} />
                  </View>
                  <TouchableOpacity style={styles.uploadBtn}>
                    <Feather name="upload" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.uploadBtnText}>Choose image</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.subText}>JPG or PNG, up to 2MB</Text>
              </View>

            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setShowCreateModal(false)} style={styles.btnCancel}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.btnSave, creating && { opacity: 0.7 }]} 
                onPress={handleCreateUser} 
                disabled={creating}
              >
                {creating ? <ActivityIndicator size="small" color={COLORS.brand} /> : <Text style={styles.btnSaveText}>Create User</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit User Modal */}
      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Update User</Text>
                <Text style={styles.modalSubtitle}>Update user details. Leave password empty to keep it unchanged.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEditModal(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username *</Text>
                <TextInput 
                  style={[styles.input, { borderColor: COLORS.brand }]} 
                  placeholder="e.g. JohnDoe" 
                  value={editForm.username} 
                  onChangeText={t => setEditForm({...editForm, username: t})} 
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput 
                      style={styles.passwordInput} 
                      placeholder="Password" 
                      value={editForm.password} 
                      onChangeText={t => setEditForm({...editForm, password: t})} 
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput 
                      style={styles.passwordInput} 
                      placeholder="Confirm password" 
                      value={editForm.confirmPassword} 
                      onChangeText={t => setEditForm({...editForm, confirmPassword: t})} 
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                      <Feather name={showConfirmPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>E-mail *</Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="name@company.com" 
                    value={editForm.email} 
                    onChangeText={t => setEditForm({...editForm, email: t})} 
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Mobile Number</Text>
                  <View style={styles.phoneContainer}>
                    <View style={styles.countryCode}>
                      <Text style={{ fontSize: 16 }}>🇮🇳</Text>
                      <Text style={{ marginLeft: 4, color: COLORS.textPrimary }}>+91</Text>
                      <Feather name="chevron-down" size={14} color={COLORS.textSecondary} style={{ marginLeft: 4 }} />
                    </View>
                    <TextInput 
                      style={styles.phoneInput} 
                      placeholder="0000000000" 
                      value={editForm.phone} 
                      onChangeText={t => setEditForm({...editForm, phone: t})} 
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.btnCancel}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.btnSave, editing && { opacity: 0.7 }]} 
                onPress={handleUpdateUser} 
                disabled={editing}
              >
                {editing ? <ActivityIndicator size="small" color={COLORS.brand} /> : <Text style={styles.btnSaveText}>Save Changes</Text>}
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
  tabsContainer: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsScroll: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6
  },
  tabActive: {
    borderBottomColor: COLORS.brand,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.brand,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeActive: {
    backgroundColor: COLORS.brand + '20',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  badgeTextActive: {
    color: COLORS.brand,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingLeft: 36,
    paddingRight: 12,
    color: COLORS.textPrimary,
  },
  searchIcon: {
    position: 'absolute',
    left: 28,
    zIndex: 1,
  },
  filterBtn: {
    width: 40,
    height: 40,
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
    paddingTop: 0,
    gap: 12,
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
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 12,
    gap: 4
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
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
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  actionBtn: {
    padding: 4,
  },
  
  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)', // Darker overlay
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    maxHeight: '90%',
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
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    maxWidth: '90%',
  },
  modalBody: {
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  inputGroup: {
    marginBottom: 20,
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
  subText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    height: 40,
    backgroundColor: COLORS.white,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
  },
  eyeIcon: {
    padding: 10,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    height: 40,
    backgroundColor: COLORS.white,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  uploadBtnText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
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
    borderWidth: 1,
    borderColor: COLORS.brand,
    backgroundColor: COLORS.white,
    minWidth: 100,
    alignItems: 'center',
  },
  btnSaveText: {
    color: COLORS.brand,
    fontWeight: '600',
  },
});
