import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getMailSettings, updateMailSettings, testMailConnection } from '../../services/settings';

const COLORS = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  brand: '#4F46E5', // Matches screenshot purple-ish blue
  white: '#FFFFFF',
  brandLight: '#EEF2FF',
  danger: '#EF4444'
};

export default function MailSettingsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  
  // Chip inputs state
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');

  const [form, setForm] = useState({
    enabled: true,
    smtpHost: '',
    smtpPort: '465',
    smtpUsername: '',
    smtpPassword: '',
    smtpAuth: 'True',
    starttls: 'True',
    fromEmail: '',
    fromName: '',
    defaultCc: [],
    defaultBcc: []
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMailSettings();
      setForm({
        enabled: data.enabled ?? true,
        smtpHost: data.smtpHost || '',
        smtpPort: data.smtpPort?.toString() || '465',
        smtpUsername: data.smtpUsername || '',
        smtpPassword: '', // Don't show password
        smtpAuth: data.smtpAuth || 'True',
        starttls: data.starttls || 'True',
        fromEmail: data.fromEmail || '',
        fromName: data.fromName || '',
        defaultCc: data.defaultCc ? data.defaultCc.split(',').filter(Boolean) : [],
        defaultBcc: data.defaultBcc ? data.defaultBcc.split(',').filter(Boolean) : []
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
      const payload = {
        enabled: form.enabled,
        smtpHost: form.smtpHost,
        smtpPort: parseInt(form.smtpPort, 10),
        smtpUsername: form.smtpUsername,
        smtpAuth: form.smtpAuth,
        starttls: form.starttls,
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        defaultCc: form.defaultCc.join(','),
        defaultBcc: form.defaultBcc.join(',')
      };
      if (form.smtpPassword) {
        payload.smtpPassword = form.smtpPassword;
      }
      
      await updateMailSettings(payload);
      Alert.alert('Success', 'Mail settings saved successfully');
      setForm(prev => ({ ...prev, smtpPassword: '' })); // clear password after save
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      Alert.alert('Error', 'Please enter a recipient email');
      return;
    }
    try {
      setTesting(true);
      await testMailConnection({ recipientEmail: testEmail });
      Alert.alert('Success', 'Test email sent successfully!');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to send test email. Please verify your settings and save first.');
    } finally {
      setTesting(false);
    }
  };

  const addChip = (type, value, setInput) => {
    const email = value.trim();
    if (!email) return;
    setForm(prev => ({
      ...prev,
      [type]: [...prev[type], email]
    }));
    setInput('');
  };

  const removeChip = (type, index) => {
    setForm(prev => {
      const arr = [...prev[type]];
      arr.splice(index, 1);
      return { ...prev, [type]: arr };
    });
  };

  const renderDropdown = (label, field) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity 
        style={styles.dropdown}
        onPress={() => setForm({ ...form, [field]: form[field] === 'True' ? 'False' : 'True' })}
      >
        <Text style={styles.dropdownText}>{form[field]}</Text>
        <Feather name="chevron-down" size={16} color={COLORS.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  const renderChipInput = (label, field, inputVal, setInputVal) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipInputContainer}>
        <TextInput 
          style={styles.chipInput}
          placeholder="Enter email and press Add"
          value={inputVal}
          onChangeText={setInputVal}
          autoCapitalize="none"
          keyboardType="email-address"
          onSubmitEditing={() => addChip(field, inputVal, setInputVal)}
        />
        <TouchableOpacity style={styles.chipAddBtn} onPress={() => addChip(field, inputVal, setInputVal)}>
          <Text style={styles.chipAddBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {form[field].length > 0 && (
        <View style={styles.chipsRow}>
          {form[field].map((email, idx) => (
            <View key={idx} style={styles.chip}>
              <Text style={styles.chipText}>{email}</Text>
              <TouchableOpacity onPress={() => removeChip(field, idx)} style={{ padding: 2, marginLeft: 4 }}>
                <Feather name="x" size={12} color={COLORS.brand} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <Feather name="menu" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings : Email Settings</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity 
            style={styles.saveBtn} 
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator size="small" color={COLORS.brand} /> : (
              <>
                <Feather name="save" size={14} color={COLORS.brand} />
                <Text style={styles.saveBtnText}>Save Settings</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'Dashboard' })}>
            <Feather name="arrow-left" size={14} color={COLORS.textSecondary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.brand} />
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* SMTP Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>SMTP Server Configuration</Text>
              <Text style={styles.cardSubtitle}>
                Configure the SMTP server settings used by the system to dispatch notifications and emails.
              </Text>
            </View>

            <View style={styles.cardBody}>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 0.5 }]}>
                  <Text style={styles.label}>Enabled</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Switch
                      trackColor={{ false: '#CBD5E1', true: '#C7D2FE' }}
                      thumbColor={form.enabled ? COLORS.brand : '#F1F5F9'}
                      onValueChange={(val) => setForm({...form, enabled: val})}
                      value={form.enabled}
                    />
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginLeft: 8 }}>Send emails</Text>
                  </View>
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>SMTP Host</Text>
                  <TextInput 
                    style={styles.input}
                    value={form.smtpHost}
                    onChangeText={t => setForm({...form, smtpHost: t})}
                    placeholder="smtp.gmail.com"
                    autoCapitalize="none"
                  />
                </View>
                
                <View style={[styles.inputGroup, { flex: 0.5 }]}>
                  <Text style={styles.label}>Port</Text>
                  <TextInput 
                    style={styles.input}
                    value={form.smtpPort}
                    onChangeText={t => setForm({...form, smtpPort: t})}
                    keyboardType="numeric"
                    placeholder="465"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Username</Text>
                  <TextInput 
                    style={styles.input}
                    value={form.smtpUsername}
                    onChangeText={t => setForm({...form, smtpUsername: t})}
                    placeholder="example@gmail.com"
                    autoCapitalize="none"
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput 
                      style={styles.passwordInput} 
                      placeholder="••••••••••••" 
                      value={form.smtpPassword} 
                      onChangeText={t => setForm({...form, smtpPassword: t})} 
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.subText}>Password is set. Leave blank to keep existing.</Text>
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  {renderDropdown("SMTP Auth", "smtpAuth")}
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  {renderDropdown("STARTTLS", "starttls")}
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>From Email Address</Text>
                  <TextInput 
                    style={styles.input}
                    value={form.fromEmail}
                    onChangeText={t => setForm({...form, fromEmail: t})}
                    placeholder="example@gmail.com"
                    autoCapitalize="none"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>From Sender Name</Text>
                  <TextInput 
                    style={styles.input}
                    value={form.fromName}
                    onChangeText={t => setForm({...form, fromName: t})}
                    placeholder="NexorCRM Application Notification"
                  />
                </View>
              </View>

              {renderChipInput("Default CC Recipients", "defaultCc", ccInput, setCcInput)}
              {renderChipInput("Default BCC Recipients", "defaultBcc", bccInput, setBccInput)}

            </View>
          </View>

          {/* Test Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Test Connection</Text>
              <Text style={styles.cardSubtitle}>
                Verify your configuration settings by sending a test email to any recipient.
              </Text>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.testRow}>
                <View style={[styles.inputGroup, { flex: 1, marginBottom: 0 }]}>
                  <Text style={styles.label}>Recipient Email Address</Text>
                  <TextInput 
                    style={styles.input}
                    value={testEmail}
                    onChangeText={setTestEmail}
                    placeholder="test-recipient@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
                <TouchableOpacity 
                  style={[styles.testBtn, testing && { opacity: 0.7 }]} 
                  onPress={handleTestEmail}
                  disabled={testing}
                >
                  {testing ? <ActivityIndicator size="small" color={COLORS.brand} /> : (
                    <>
                      <Feather name="send" size={14} color={COLORS.brand} />
                      <Text style={styles.testBtnText}>Send Test Email</Text>
                    </>
                  )}
                </TouchableOpacity>
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
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 6,
    gap: 4
  },
  saveBtnText: {
    fontSize: 12,
    color: COLORS.brand,
    fontWeight: '600',
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
  
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    overflow: 'hidden'
  },
  cardHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bg,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  cardBody: {
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap', // For mobile, let it wrap if needed
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
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.white,
  },
  passwordInputContainer: {
    flexDirection: 'row',
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
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  subText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 6,
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

  // Chip input
  chipInputContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    height: 40,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },
  chipInput: {
    flex: 1,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
  },
  chipAddBtn: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  chipAddBtnText: {
    fontSize: 13,
    color: COLORS.brand,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.brandLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.brand + '30',
  },
  chipText: {
    fontSize: 12,
    color: COLORS.brand,
    fontWeight: '500',
  },

  // Test Area
  testRow: {
    gap: 16, // Stack vertically on small screens
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 6,
    gap: 8,
    marginTop: 8,
  },
  testBtnText: {
    color: COLORS.brand,
    fontWeight: '600',
    fontSize: 14,
  },
});
