import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getReminderSettings, updateReminderSettings } from '../../services/settings';

const COLORS = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  brand: '#1D4ED8',
  white: '#FFFFFF',
  purpleBg: '#F3E8FF',
  purpleText: '#7E22CE'
};

export default function RemindersScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: true,
    leadMinutes: '180',
    repeatMinutes: '30',
    maxReminders: '0',
    overdueEnabled: true,
    overdueRepeatMinutes: '60',
    escalateAfterMinutes: '120',
    channelInApp: true,
    channelPush: true,
    channelEmail: false
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getReminderSettings();
      setForm({
        enabled: data.enabled ?? true,
        leadMinutes: data.leadMinutes?.toString() || '180',
        repeatMinutes: data.repeatMinutes?.toString() || '30',
        maxReminders: data.maxReminders?.toString() || '0',
        overdueEnabled: data.overdueEnabled ?? true,
        overdueRepeatMinutes: data.overdueRepeatMinutes?.toString() || '60',
        escalateAfterMinutes: data.escalateAfterMinutes?.toString() || '120',
        channelInApp: data.channelInApp ?? true,
        channelPush: data.channelPush ?? true,
        channelEmail: data.channelEmail ?? false,
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
      await updateReminderSettings({
        enabled: form.enabled,
        leadMinutes: parseInt(form.leadMinutes, 10),
        repeatMinutes: parseInt(form.repeatMinutes, 10),
        maxReminders: parseInt(form.maxReminders, 10),
        overdueEnabled: form.overdueEnabled,
        overdueRepeatMinutes: parseInt(form.overdueRepeatMinutes, 10),
        escalateAfterMinutes: parseInt(form.escalateAfterMinutes, 10),
        channelInApp: form.channelInApp,
        channelPush: form.channelPush,
        channelEmail: form.channelEmail
      });
      Alert.alert('Success', 'Reminder settings updated');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const renderPresetBtn = (label, value, field) => (
    <TouchableOpacity 
      style={styles.presetBtn}
      onPress={() => setForm({ ...form, [field]: value.toString() })}
    >
      <Text style={styles.presetBtnText}>{label}</Text>
    </TouchableOpacity>
  );

  const renderDropdown = (label, field, subText) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity 
        style={styles.dropdown}
        onPress={() => setForm({ ...form, [field]: !form[field] })}
      >
        <Text style={styles.dropdownText}>{form[field] ? 'Yes' : 'No'}</Text>
        <Feather name="chevron-down" size={16} color={COLORS.textSecondary} />
      </TouchableOpacity>
      {subText ? <Text style={styles.subText}>{subText}</Text> : null}
    </View>
  );

  const renderInput = (label, field, suffix, subText, presetNodes) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWithSuffix}>
        <TextInput 
          style={styles.inputFlex}
          value={form[field]}
          onChangeText={t => setForm({ ...form, [field]: t })}
          keyboardType="numeric"
        />
        <View style={styles.suffix}>
          <Text style={styles.suffixText}>{suffix}</Text>
        </View>
      </View>
      {subText ? <Text style={styles.subText}>{subText}</Text> : null}
      
      {presetNodes ? (
        <>
          <Text style={styles.presetsLabel}>Common windows</Text>
          <View style={styles.presetsRow}>
            {presetNodes}
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <Feather name="menu" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings : Reminders</Text>
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
                <Feather name="bell" size={18} color={COLORS.purpleText} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Activity Reminders</Text>
                <Text style={styles.cardSubtitle}>
                  One set of timings for every dated activity in the CRM — lead and opportunity follow-ups, tasks, calls, meetings and site visits.
                </Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              
              {renderDropdown("Enable Reminders *", "enabled", "Off sends nothing at all. Activities and their due dates are untouched.")}
              
              {renderInput("Remind Before *", "leadMinutes", "Minutes", `Currently ${form.leadMinutes} minutes before the activity is due.`, (
                <>
                  {renderPresetBtn("1 hr", 60, "leadMinutes")}
                  {renderPresetBtn("2 hr", 120, "leadMinutes")}
                  {renderPresetBtn("3 hr", 180, "leadMinutes")}
                  {renderPresetBtn("6 hr", 360, "leadMinutes")}
                </>
              ))}

              {renderInput("Repeat Every *", "repeatMinutes", "Minutes", `e.g. reminders: 15:42, 16:12, 16:42, 17:12, 17:42, 18:12`, (
                <>
                  {renderPresetBtn("15 min", 15, "repeatMinutes")}
                  {renderPresetBtn("30 min", 30, "repeatMinutes")}
                  {renderPresetBtn("60 min", 60, "repeatMinutes")}
                </>
              ))}

              {renderInput("Maximum Reminders", "maxReminders", "Reminders", "0 means no cap — the series runs to the due time.", null)}
              
              {renderDropdown("Overdue Reminders *", "overdueEnabled", "Keep reminding after the due time has passed.")}
              
              {renderInput("Overdue Repeat Every", "overdueRepeatMinutes", "Minutes", "How often to chase an activity that is already late.", null)}
              
              {renderInput("Escalate After", "escalateAfterMinutes", "Minutes overdue", "The owner's reporting manager is told as well once it has been late this long. 0 never escalates.", null)}
              
              {renderDropdown("In-app (Bell)", "channelInApp", "The notification bell. This one always reaches the user.")}
              
              {renderDropdown("Push Notification", "channelPush", "Needs the browser to have notifications turned on for this site.")}
              
              {renderDropdown("Email", "channelEmail", "Not yet wired to the mail sender — the bell and push are the live channels.")}

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
                <Text style={styles.helpSubTitle}>Remind before</Text>
                <Text style={styles.helpText}>How far ahead of the due time the first reminder goes out. The default is 3 hours, so a 6:00pm follow-up starts reminding at 3:00pm.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Repeat every</Text>
                <Text style={styles.helpText}>How often it reminds after that, up to the due time. At 30 minutes a 6:00pm follow-up reminds at 3:00, 3:30, 4:00, 4:30, 5:00 and 5:30.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Maximum reminders</Text>
                <Text style={styles.helpText}>A cap per activity, so a long window cannot become a stream. 0 means no cap — the series simply runs to the due time.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Overdue reminders</Text>
                <Text style={styles.helpText}>Keep reminding after the due time has passed, on their own interval. Turn this off to stop at the due time.</Text>
              </View>

              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Escalate after</Text>
                <Text style={styles.helpText}>How long past due before the owner's reporting manager is told as well — and the administrators, if nobody is named as their manager. 0 never escalates.</Text>
              </View>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>What stops a reminder</Text>
                <Text style={styles.helpText}>Completing, cancelling or converting the activity. Nothing is scheduled in advance, so a finished activity is simply never found again. Rescheduling starts a fresh series from the new time.</Text>
              </View>
              
              <View style={styles.helpItem}>
                <Text style={styles.helpSubTitle}>Channels</Text>
                <Text style={styles.helpText}>The bell always works. Push needs the browser to have notifications turned on for this site.</Text>
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
    alignItems: 'flex-start',
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
