import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getUserSettings, updateUserSettings } from '../../services/settings';

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

export default function UserSettingsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    allowMultipleLogins: true,
    individualUserHomepages: false,
    howAreTheySet: 'By Admin (Set below..)',
    pathSetByAdmin: '/',
    excludeAdmins: true
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getUserSettings();
      setForm({
        allowMultipleLogins: data.allowMultipleLogins ?? true,
        individualUserHomepages: data.individualUserHomepages ?? false,
        howAreTheySet: data.howAreTheySet || 'By Admin (Set below..)',
        pathSetByAdmin: data.pathSetByAdmin || '/',
        excludeAdmins: data.excludeAdmins ?? true
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
      await updateUserSettings({
        allowMultipleLogins: form.allowMultipleLogins,
        individualUserHomepages: form.individualUserHomepages,
        howAreTheySet: form.howAreTheySet,
        pathSetByAdmin: form.pathSetByAdmin,
        excludeAdmins: form.excludeAdmins
      });
      Alert.alert('Success', 'User settings updated successfully');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const renderRadioBtn = (label, isSelected, onPress) => (
    <TouchableOpacity style={styles.radioBtn} onPress={onPress}>
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
          <Text style={styles.headerTitle}>Settings : User Settings</Text>
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
          
          {/* Card 1: General User Settings */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Feather name="users" size={16} color={COLORS.purpleText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>General User Settings</Text>
                <Text style={styles.cardSubtitle}>Change global settings for user accounts.</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Allow Multiple Logins</Text>
                {renderRadioBtn("Yes", form.allowMultipleLogins === true, () => setForm({ ...form, allowMultipleLogins: true }))}
                {renderRadioBtn("No", form.allowMultipleLogins === false, () => setForm({ ...form, allowMultipleLogins: false }))}
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

          {/* Card 2: Individual User Folders */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Feather name="folder" size={16} color={COLORS.purpleText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Individual User Folders</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Individual User Homepages</Text>
                {renderRadioBtn("Yes", form.individualUserHomepages === true, () => setForm({ ...form, individualUserHomepages: true }))}
                {renderRadioBtn("No", form.individualUserHomepages === false, () => setForm({ ...form, individualUserHomepages: false }))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>How are they Set?</Text>
                {renderRadioBtn("By User (See User Admin page)", form.howAreTheySet === "By User (See User Admin page)", () => setForm({ ...form, howAreTheySet: "By User (See User Admin page)" }))}
                {renderRadioBtn("By Admin (Set below..)", form.howAreTheySet === "By Admin (Set below..)", () => setForm({ ...form, howAreTheySet: "By Admin (Set below..)" }))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Path (Set by Admin)</Text>
                <View style={styles.inputWithSuffixContainer}>
                  <TextInput 
                    style={styles.inputWithSuffixInput}
                    value={form.pathSetByAdmin}
                    onChangeText={t => setForm({ ...form, pathSetByAdmin: t })}
                    autoCapitalize="none"
                  />
                  <View style={styles.inputSuffix}>
                    <Text style={styles.inputSuffixText}>Relative to Site Root</Text>
                  </View>
                </View>
                <Text style={styles.helpTextDesc}>
                  The path you choose should be set relative to the admin folder (which will be your Site Root, set in the General Settings page in the Control Panel). Therefore you'll most likely want to go back a folder before choosing any subfolder you create for the unique user pages. Use ../ to go back a folder. So for example, if you site's admin control panel is here - ../users/ then the user page might be ../users/admin.php
                  {'\n\n'}Wildcard available : %username% (ie, logged in user's username)
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Exclude Admins</Text>
                {renderRadioBtn("Yes", form.excludeAdmins === true, () => setForm({ ...form, excludeAdmins: true }))}
                {renderRadioBtn("No", form.excludeAdmins === false, () => setForm({ ...form, excludeAdmins: false }))}
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
                <Text style={styles.helpSubTitle}>Allow Multiple Logins</Text>
                <Text style={styles.helpText}>Turn on to allow multiple logins from the same account.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Individual User Homepages</Text>
                <Text style={styles.helpText}>Turn on or off the option to set individual home pages for users, which they are directed to after logon.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>How are they Set?</Text>
                <Text style={styles.helpText}>Is the homepage set by the admin here on this page (maybe using a mixture of wildcards to make the path dynamic), or in each individual user's settings.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Path</Text>
                <Text style={styles.helpText}>If the path is to be set by the admin, set it here using any wildcards available to you. Example, %username%/%username%.php which might be user1/user1.php - This example will be relative to the site root so for example the one above might be - http://www.website.com/login/user1/user1.php</Text>
              </View>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Exclude Admins</Text>
                <Text style={styles.helpText}>Redirection is disabled for Admin Accounts if set to Yes.</Text>
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
  
  // Cards
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
  helpTextDesc: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
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
});
