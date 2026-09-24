import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getSessionSettings, updateSessionSettings } from '../../services/settings';

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
  purpleText: '#4F46E5'
};

export default function SessionSettingsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    userInactivityTimeout: '20',
    guestTimeout: '5',
    resetExpiryAtLogon: 'Yes',
    cookieExpiry: '14',
    cookiePath: '/'
  });

  const [showDropdown, setShowDropdown] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSessionSettings();
      setForm({
        userInactivityTimeout: data.userInactivityTimeout?.toString() || '20',
        guestTimeout: data.guestTimeout?.toString() || '5',
        resetExpiryAtLogon: data.resetExpiryAtLogon || 'Yes',
        cookieExpiry: data.cookieExpiry?.toString() || '14',
        cookiePath: data.cookiePath || '/'
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

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateSessionSettings({
        userInactivityTimeout: parseInt(form.userInactivityTimeout, 10),
        guestTimeout: parseInt(form.guestTimeout, 10),
        resetExpiryAtLogon: form.resetExpiryAtLogon,
        cookieExpiry: parseInt(form.cookieExpiry, 10),
        cookiePath: form.cookiePath
      });
      Alert.alert('Success', 'Session settings updated successfully');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const renderInputWithSuffix = (label, value, onChangeText, suffix) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label} <Text style={{color: COLORS.danger}}>*</Text></Text>
      <View style={styles.inputWithSuffixContainer}>
        <TextInput 
          style={styles.inputWithSuffixInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
        />
        <View style={styles.inputSuffix}>
          <Text style={styles.inputSuffixText}>{suffix}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <Feather name="menu" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings : Session Settings</Text>
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
          
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Feather name="clock" size={16} color={COLORS.purpleText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Session Settings</Text>
                <Text style={styles.cardSubtitle}>Change the settings regarding sessions.</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              
              {renderInputWithSuffix('User Inactivity Timeout', form.userInactivityTimeout, (t) => setForm({...form, userInactivityTimeout: t}), 'Minutes')}
              {renderInputWithSuffix('Guest Timeout', form.guestTimeout, (t) => setForm({...form, guestTimeout: t}), 'Minutes')}
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Reset Expiry at Logon <Text style={{color: COLORS.danger}}>*</Text></Text>
                <TouchableOpacity 
                  style={styles.dropdown}
                  onPress={() => setShowDropdown(true)}
                >
                  <Text style={styles.dropdownText}>{form.resetExpiryAtLogon}</Text>
                  <Feather name="chevron-down" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {renderInputWithSuffix('Cookie Expiry', form.cookieExpiry, (t) => setForm({...form, cookieExpiry: t}), 'Days')}
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Cookie Path <Text style={{color: COLORS.danger}}>*</Text></Text>
                <TextInput 
                  style={styles.input}
                  value={form.cookiePath}
                  onChangeText={t => setForm({ ...form, cookiePath: t })}
                  autoCapitalize="none"
                />
              </View>

            </View>

            <View style={styles.cardFooter}>
              <TouchableOpacity 
                style={[styles.submitBtn, saving && { opacity: 0.7 }]} 
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color={COLORS.brand} /> : <Text style={styles.submitBtnText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Help Card */}
          <View style={styles.helpCard}>
            <View style={styles.helpHeader}>
              <Feather name="help-circle" size={16} color={COLORS.brand} />
              <Text style={styles.helpTitle}>Need Help ?</Text>
            </View>
            <View style={styles.helpBody}>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>User Inactivity Timeout</Text>
                <Text style={styles.helpText}>The user is logged out after the set period of inactivity. The default PHP session timeout is usually already set at 24 minutes.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Guest Timeout</Text>
                <Text style={styles.helpText}>A guest is no longer considered a guest (and counted in the whose online figures) after this set period of inactivity.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Reset Expiry at Logon</Text>
                <Text style={styles.helpText}>When set to Yes, when a user logs on with a Remember Me cookie, his expiry date will extend by the amount set below. When set to No, he will have to re-logon after the expiry date.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Remember Me Cookie Expiry</Text>
                <Text style={styles.helpText}>This is the amount of days in which the remember me cookie expires.</Text>
              </View>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Cookie Path</Text>
                <Text style={styles.helpText}>The Path attribute defines the scope of the cookie. Leave as / by default.</Text>
              </View>

            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Dropdown Modal */}
      <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowDropdown(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownTitle}>Reset Expiry at Logon</Text>
            {['Yes', 'No'].map(opt => (
              <TouchableOpacity 
                key={opt}
                style={styles.dropdownOption}
                onPress={() => {
                  setForm({ ...form, resetExpiryAtLogon: opt });
                  setShowDropdown(false);
                }}
              >
                <Text style={[styles.dropdownOptionText, form.resetExpiryAtLogon === opt && styles.dropdownOptionSelected]}>
                  {opt}
                </Text>
                {form.resetExpiryAtLogon === opt && <Feather name="check" size={16} color={COLORS.brand} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
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
  
  // Main Card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    overflow: 'hidden'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bg,
    gap: 12,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.purpleBg,
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
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
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
  inputWithSuffixContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    height: 40,
    backgroundColor: COLORS.white,
  },
  inputWithSuffixInput: {
    flex: 1,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
  },
  inputSuffix: {
    justifyContent: 'center',
    paddingRight: 12,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.bg,
  },
  inputSuffixText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    height: 40,
    paddingHorizontal: 12,
  },
  dropdownText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  cardFooter: {
    alignItems: 'flex-end',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.bg,
  },
  submitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 6,
    minWidth: 100,
    alignItems: 'center',
  },
  submitBtnText: {
    color: COLORS.brand,
    fontWeight: '600',
    fontSize: 14,
  },

  // Help Card
  helpCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bg,
    gap: 8,
  },
  helpTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  helpBody: {
    padding: 16,
    gap: 16,
  },
  helpItem: {
    gap: 4,
  },
  helpSubTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  helpText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  // Dropdown Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdownModal: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    width: '100%',
    padding: 16,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bg,
  },
  dropdownOptionText: {
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  dropdownOptionSelected: {
    color: COLORS.brand,
    fontWeight: '600',
  }
});
