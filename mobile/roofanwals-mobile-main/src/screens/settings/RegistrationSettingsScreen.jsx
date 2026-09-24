import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView, Alert, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getRegistrationSettings, updateRegistrationSettings } from '../../services/settings';

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

const ACCOUNT_ACTIVATION_OPTS = [
  'Disable Registration',
  'No Activation (immediate access)',
  'User Activation (e-mail verification)',
  'Admin Activation'
];

const USERNAME_CHARS_OPTS = [
  'Letter Num and Spaces',
  'Alphanumeric',
  'Letters Only'
];

export default function RegistrationSettingsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    accountActivation: 'Admin Activation',
    limitUsernameCharacters: 'Letter Num and Spaces',
    usernameLengthMin: '5',
    usernameLengthMax: '36',
    passwordLengthMin: '8',
    passwordLengthMax: '120',
    sendWelcomeEmail: true,
    enableCaptcha: false,
    usernameLowercase: false
  });

  const [showDropdown, setShowDropdown] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRegistrationSettings();
      setForm({
        accountActivation: data.accountActivation || 'Admin Activation',
        limitUsernameCharacters: data.limitUsernameCharacters || 'Letter Num and Spaces',
        usernameLengthMin: data.usernameLengthMin?.toString() || '5',
        usernameLengthMax: data.usernameLengthMax?.toString() || '36',
        passwordLengthMin: data.passwordLengthMin?.toString() || '8',
        passwordLengthMax: data.passwordLengthMax?.toString() || '120',
        sendWelcomeEmail: data.sendWelcomeEmail ?? true,
        enableCaptcha: data.enableCaptcha ?? false,
        usernameLowercase: data.usernameLowercase ?? false
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
      await updateRegistrationSettings({
        accountActivation: form.accountActivation,
        limitUsernameCharacters: form.limitUsernameCharacters,
        usernameLengthMin: parseInt(form.usernameLengthMin, 10),
        usernameLengthMax: parseInt(form.usernameLengthMax, 10),
        passwordLengthMin: parseInt(form.passwordLengthMin, 10),
        passwordLengthMax: parseInt(form.passwordLengthMax, 10),
        sendWelcomeEmail: form.sendWelcomeEmail,
        enableCaptcha: form.enableCaptcha,
        usernameLowercase: form.usernameLowercase
      });
      Alert.alert('Success', 'Registration settings updated successfully');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const renderRadioBtn = (label, isSelected, onPress) => (
    <TouchableOpacity key={label} style={styles.radioBtn} onPress={onPress}>
      <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
        {isSelected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <Feather name="menu" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings : Registration Settings</Text>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Dashboard')}>
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
                <Feather name="user-plus" size={16} color={COLORS.purpleText} />
              </View>
              <Text style={styles.cardTitle}>Registration Settings - Change The Settings Regarding Registration To The Site.</Text>
            </View>

            <View style={styles.cardBody}>
              
              {/* Account Activation */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Account Activation</Text>
                {ACCOUNT_ACTIVATION_OPTS.map(opt => (
                  renderRadioBtn(opt, form.accountActivation === opt, () => setForm({ ...form, accountActivation: opt }))
                ))}
              </View>

              {/* Limit Username Characters */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Limit Username Characters</Text>
                <TouchableOpacity 
                  style={styles.dropdown}
                  onPress={() => setShowDropdown(true)}
                >
                  <Text style={styles.dropdownText}>{form.limitUsernameCharacters}</Text>
                  <Feather name="chevron-down" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Username Length */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username Length *</Text>
                <View style={styles.rangeRow}>
                  <TextInput 
                    style={[styles.input, { flex: 1 }]}
                    value={form.usernameLengthMin}
                    onChangeText={t => setForm({ ...form, usernameLengthMin: t })}
                    keyboardType="numeric"
                  />
                  <Text style={styles.rangeText}>to</Text>
                  <TextInput 
                    style={[styles.input, { flex: 1 }]}
                    value={form.usernameLengthMax}
                    onChangeText={t => setForm({ ...form, usernameLengthMax: t })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Password Length */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password Length *</Text>
                <View style={styles.rangeRow}>
                  <TextInput 
                    style={[styles.input, { flex: 1 }]}
                    value={form.passwordLengthMin}
                    onChangeText={t => setForm({ ...form, passwordLengthMin: t })}
                    keyboardType="numeric"
                  />
                  <Text style={styles.rangeText}>to</Text>
                  <TextInput 
                    style={[styles.input, { flex: 1 }]}
                    value={form.passwordLengthMax}
                    onChangeText={t => setForm({ ...form, passwordLengthMax: t })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Send Welcome Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Send Welcome E-mail</Text>
                {renderRadioBtn("Yes", form.sendWelcomeEmail === true, () => setForm({ ...form, sendWelcomeEmail: true }))}
                {renderRadioBtn("No", form.sendWelcomeEmail === false, () => setForm({ ...form, sendWelcomeEmail: false }))}
              </View>

              {/* Enable Captcha */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Enable Captcha</Text>
                {renderRadioBtn("Yes", form.enableCaptcha === true, () => setForm({ ...form, enableCaptcha: true }))}
                {renderRadioBtn("No", form.enableCaptcha === false, () => setForm({ ...form, enableCaptcha: false }))}
              </View>

              {/* Username Lowercase */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username Lowercase</Text>
                {renderRadioBtn("Yes", form.usernameLowercase === true, () => setForm({ ...form, usernameLowercase: true }))}
                {renderRadioBtn("No", form.usernameLowercase === false, () => setForm({ ...form, usernameLowercase: false }))}
              </View>

            </View>

            <View style={styles.cardFooter}>
              <TouchableOpacity 
                style={[styles.submitBtn, saving && { opacity: 0.7 }]} 
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color={COLORS.brand} /> : <Text style={styles.submitBtnText}>Submit Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Help Card */}
          <View style={styles.helpCard}>
            <View style={styles.helpHeader}>
              <Feather name="help-circle" size={16} color={COLORS.textPrimary} />
              <Text style={styles.helpTitle}>Need Help ?</Text>
            </View>
            <View style={styles.helpBody}>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Account Activation</Text>
                <Text style={styles.helpText}>User Activation requires the new user to activate their account by clicking a link sent to their e-mail address. Admin Activation requires an admin to activate the account using the control panel or by a link sent to their e-mail address.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Limit Username Characters</Text>
                <Text style={styles.helpText}>Limit the characters allowed in new username registrations.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Username Length</Text>
                <Text style={styles.helpText}>Minimum and maximum username length.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Password Length</Text>
                <Text style={styles.helpText}>Minimum and maximum password length.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Send Welcome E-mail</Text>
                <Text style={styles.helpText}>Whether or not to send a welcome e-mail to all new users upon registration.</Text>
              </View>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Enable Captcha</Text>
                <Text style={styles.helpText}>Do I want this?.</Text>
              </View>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Username Lowercase</Text>
                <Text style={styles.helpText}>When set to yes, all registered usernames are made lowercase.</Text>
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
            <Text style={styles.dropdownTitle}>Select Option</Text>
            {USERNAME_CHARS_OPTS.map(opt => (
              <TouchableOpacity 
                key={opt}
                style={styles.dropdownOption}
                onPress={() => {
                  setForm({ ...form, limitUsernameCharacters: opt });
                  setShowDropdown(false);
                }}
              >
                <Text style={[styles.dropdownOptionText, form.limitUsernameCharacters === opt && styles.dropdownOptionSelected]}>
                  {opt}
                </Text>
                {form.limitUsernameCharacters === opt && <Feather name="check" size={16} color={COLORS.brand} />}
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
    alignItems: 'center',
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
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 20,
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
  radioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: COLORS.brand,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.brand,
  },
  radioLabel: {
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rangeText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  cardFooter: {
    alignItems: 'flex-end',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.bg,
  },
  submitBtn: {
    paddingHorizontal: 16,
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
