import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getSecuritySettings, updateSecuritySettings } from '../../services/settings';

const COLORS = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  brand: '#4F46E5', // Matches screenshot
  white: '#FFFFFF',
  purpleBg: '#EEF2FF',
  purpleText: '#4F46E5',
  redBg: '#FEF2F2',
  redText: '#EF4444'
};

export default function SecuritySettingsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  const [settingsData, setSettingsData] = useState({
    disallowedUsernames: [],
    bannedIPs: []
  });

  const [newUsername, setNewUsername] = useState('');
  const [selectedUsernames, setSelectedUsernames] = useState(new Set());

  const [newIp, setNewIp] = useState('');
  const [selectedIps, setSelectedIps] = useState(new Set());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSecuritySettings();
      setSettingsData({
        disallowedUsernames: data.disallowedUsernames || [],
        bannedIPs: data.bannedIPs || []
      });
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async (newData) => {
    try {
      setProcessing(true);
      await updateSecuritySettings(newData);
      setSettingsData(newData);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update settings');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddUsername = () => {
    const username = newUsername.trim();
    if (!username) return;
    if (settingsData.disallowedUsernames.includes(username)) {
      Alert.alert('Error', 'Username already in list');
      return;
    }
    const newData = {
      ...settingsData,
      disallowedUsernames: [...settingsData.disallowedUsernames, username]
    };
    setNewUsername('');
    saveSettings(newData);
  };

  const handleRemoveUsernames = () => {
    if (selectedUsernames.size === 0) return;
    const newData = {
      ...settingsData,
      disallowedUsernames: settingsData.disallowedUsernames.filter(u => !selectedUsernames.has(u))
    };
    setSelectedUsernames(new Set());
    saveSettings(newData);
  };

  const handleAddIp = () => {
    const ip = newIp.trim();
    if (!ip) return;
    if (settingsData.bannedIPs.includes(ip)) {
      Alert.alert('Error', 'IP already in list');
      return;
    }
    const newData = {
      ...settingsData,
      bannedIPs: [...settingsData.bannedIPs, ip]
    };
    setNewIp('');
    saveSettings(newData);
  };

  const handleRemoveIps = () => {
    if (selectedIps.size === 0) return;
    const newData = {
      ...settingsData,
      bannedIPs: settingsData.bannedIPs.filter(ip => !selectedIps.has(ip))
    };
    setSelectedIps(new Set());
    saveSettings(newData);
  };

  const toggleSelection = (item, selectedSet, setSelection) => {
    const newSet = new Set(selectedSet);
    if (newSet.has(item)) {
      newSet.delete(item);
    } else {
      newSet.add(item);
    }
    setSelection(newSet);
  };

  const renderListBox = (items, selectedSet, setSelection) => (
    <ScrollView style={styles.listBox} nestedScrollEnabled>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>No items added</Text>
      ) : (
        items.map((item, idx) => {
          const isSelected = selectedSet.has(item);
          return (
            <TouchableOpacity 
              key={idx} 
              style={[styles.listItem, isSelected && styles.listItemSelected]}
              onPress={() => toggleSelection(item, selectedSet, setSelection)}
            >
              <Text style={[styles.listItemText, isSelected && styles.listItemTextSelected]}>{item}</Text>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <Feather name="menu" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings : Security Settings</Text>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'Dashboard' })}>
          <Feather name="arrow-left" size={14} color={COLORS.textSecondary} />
          <Text style={styles.backBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.brand} />
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          
          <View style={styles.row}>
            {/* Disallow Usernames */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconCirclePurple}>
                  <Feather name="user-x" size={16} color={COLORS.purpleText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Disallow Usernames</Text>
                  <Text style={styles.cardSubtitle}>Prevent Usernames from being registered</Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Disallow Username <Text style={{color: COLORS.redText}}>*</Text></Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="Required Field.."
                    value={newUsername}
                    onChangeText={setNewUsername}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.actionRowRight}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, processing && { opacity: 0.7 }]} 
                    onPress={handleAddUsername}
                    disabled={processing}
                  >
                    <Text style={styles.actionBtnText}>Add Username</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Disallowed Usernames</Text>
                  {renderListBox(settingsData.disallowedUsernames, selectedUsernames, setSelectedUsernames)}
                </View>

                <View style={styles.actionRowRight}>
                  <TouchableOpacity 
                    style={[styles.actionBtnOutline, selectedUsernames.size === 0 && { opacity: 0.5 }]} 
                    onPress={handleRemoveUsernames}
                    disabled={selectedUsernames.size === 0 || processing}
                  >
                    <Text style={styles.actionBtnOutlineText}>Remove Disallowed Usernames</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </View>

            {/* Ban IP Addresses */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconCircleRed}>
                  <Feather name="slash" size={16} color={COLORS.redText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Ban IP Addresses from Registering (or logging in)</Text>
                  <Text style={styles.cardSubtitle}>Block / Ban IP</Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Address <Text style={{color: COLORS.redText}}>*</Text></Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="e.g. 192.168.0.1 without leading zeros"
                    value={newIp}
                    onChangeText={setNewIp}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.actionRowRight}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, processing && { opacity: 0.7 }]} 
                    onPress={handleAddIp}
                    disabled={processing}
                  >
                    <Text style={styles.actionBtnText}>Add IP Address</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Banned IP Addresses</Text>
                  {renderListBox(settingsData.bannedIPs, selectedIps, setSelectedIps)}
                </View>

                <View style={styles.actionRowRight}>
                  <TouchableOpacity 
                    style={[styles.actionBtnOutline, selectedIps.size === 0 && { opacity: 0.5 }]} 
                    onPress={handleRemoveIps}
                    disabled={selectedIps.size === 0 || processing}
                  >
                    <Text style={styles.actionBtnOutlineText}>Remove Banned IP Addresses</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginLeft: 8,
    flex: 1
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    gap: 4
  },
  backBtnText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  content: {
    padding: 16,
  },
  row: {
    // In React Native, usually flex: 1 and flex-direction column handles the stack.
    // If it was large screen (tablet), we could use flexDirection: 'row' with flexWrap,
    // but stacking is safer for mobile dimensions.
    gap: 16,
  },
  
  // Cards
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bg,
    gap: 12,
  },
  iconCirclePurple: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.purpleBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconCircleRed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.redBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cardBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 8,
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
  actionRowRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: COLORS.white,
  },
  actionBtnText: {
    color: COLORS.textPrimary,
    fontWeight: '500',
    fontSize: 13,
  },
  actionBtnOutline: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: COLORS.white,
  },
  actionBtnOutlineText: {
    color: COLORS.textPrimary,
    fontWeight: '500',
    fontSize: 13,
  },
  
  // ListBox
  listBox: {
    height: 150,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: COLORS.bg,
  },
  listItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listItemSelected: {
    backgroundColor: COLORS.brand,
  },
  listItemText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  listItemTextSelected: {
    color: COLORS.white,
  },
  emptyText: {
    padding: 16,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  }
});
