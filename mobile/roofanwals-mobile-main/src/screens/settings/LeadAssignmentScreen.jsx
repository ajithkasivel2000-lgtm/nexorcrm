import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getLeadAssignmentSettings, updateLeadAssignmentSettings } from '../../services/settings';

const COLORS = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  brand: '#1D4ED8',
  white: '#FFFFFF',
  infoBg: '#F0FDF4',
  infoText: '#166534',
  purpleBg: '#F3E8FF',
  purpleText: '#7E22CE'
};

export default function LeadAssignmentScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    timeoutMinutes: '15',
    enabled: true,
    maxCycles: '0'
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLeadAssignmentSettings();
      setForm({
        timeoutMinutes: data.timeoutMinutes?.toString() || '15',
        enabled: data.enabled ?? true,
        maxCycles: data.maxCycles?.toString() || '0'
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
      await updateLeadAssignmentSettings({
        timeoutMinutes: parseInt(form.timeoutMinutes, 10),
        enabled: form.enabled,
        maxCycles: parseInt(form.maxCycles, 10)
      });
      Alert.alert('Success', 'Lead assignment settings updated');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const renderCommonWindowBtn = (mins) => {
    return (
      <TouchableOpacity 
        style={styles.presetBtn}
        onPress={() => setForm({ ...form, timeoutMinutes: mins.toString() })}
      >
        <Text style={styles.presetBtnText}>{mins} min</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <Feather name="menu" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings : Lead Assignment</Text>
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
          
          {/* Main Settings Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Feather name="clock" size={18} color={COLORS.purpleText} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Lead Auto Reassignment</Text>
                <Text style={styles.cardSubtitle}>
                  How long an assigned user has to respond before a lead moves to the next person on the project round-robin.
                </Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              
              {/* Timeout Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Lead Auto Reassignment Timeout *</Text>
                <View style={styles.inputWithSuffix}>
                  <TextInput 
                    style={styles.inputFlex}
                    value={form.timeoutMinutes}
                    onChangeText={t => setForm({ ...form, timeoutMinutes: t })}
                    keyboardType="numeric"
                  />
                  <View style={styles.suffix}>
                    <Text style={styles.suffixText}>Minutes</Text>
                  </View>
                </View>
                <Text style={styles.subText}>Currently {form.timeoutMinutes} minutes. Applies to every project.</Text>
                
                <Text style={styles.presetsLabel}>Common windows</Text>
                <View style={styles.presetsRow}>
                  {renderCommonWindowBtn(15)}
                  {renderCommonWindowBtn(30)}
                  {renderCommonWindowBtn(45)}
                  {renderCommonWindowBtn(60)}
                </View>
              </View>

              {/* Enable Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Enable Automatic Reassignment *</Text>
                <TouchableOpacity 
                  style={styles.dropdown}
                  onPress={() => setForm({ ...form, enabled: !form.enabled })}
                >
                  <Text style={styles.dropdownText}>{form.enabled ? 'Yes' : 'No'}</Text>
                  <Feather name="chevron-down" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.subText}>Off leaves every lead with its current owner.</Text>
              </View>

              {/* Max Cycles Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Maximum Reassignment Cycles</Text>
                <View style={styles.inputWithSuffix}>
                  <TextInput 
                    style={styles.inputFlex}
                    value={form.maxCycles}
                    onChangeText={t => setForm({ ...form, maxCycles: t })}
                    keyboardType="numeric"
                  />
                  <View style={styles.suffix}>
                    <Text style={styles.suffixText}>Cycles</Text>
                  </View>
                </View>
                <Text style={styles.subText}>0 means no limit — a lead keeps moving until somebody acts on it.</Text>
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
              <Feather name="help-circle" size={16} color={COLORS.textPrimary} />
              <Text style={styles.helpTitle}>Need Help ?</Text>
            </View>
            <View style={styles.helpBody}>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Auto Reassignment Timeout</Text>
                <Text style={styles.helpText}>How long the assigned user has to act on a new lead before it moves to the next person on the project round-robin. Applies from the moment the lead is assigned.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Valid activity</Text>
                <Text style={styles.helpText}>Any update the assigned user makes to the lead — a status change, a call outcome, a note — stops the clock and the lead stays with them.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Enable automatic reassignment</Text>
                <Text style={styles.helpText}>Turn this off to leave every lead where it is. Existing leads keep their owner; nothing is reassigned while it is off.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Maximum reassignment cycles</Text>
                <Text style={styles.helpText}>A safety limit on how many times one lead may be passed along. Set 0 for no limit, which is the normal setting.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Terminal statuses</Text>
                <Text style={styles.helpText}>A lead that is rejected, duplicate or converted stops the clock automatically — those never get reassigned, whatever this timeout says.</Text>
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.purpleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    paddingRight: 30,
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
  inputWithSuffix: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    height: 40,
  },
  inputFlex: {
    flex: 1,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
  },
  suffix: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  suffixText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  subText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  presetsLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 16,
  },
  presetBtnText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '500',
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
    alignItems: 'center',
    padding: 20,
  },
  submitBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 6,
    minWidth: 120,
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
  }
});
