import React, { useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { updateUser } from '../../../services/users';

export default function OrganizationTab({ user, overview, onRefresh }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [form, setForm] = useState({
    designation: user?.designation || '',
    dept_id: user?.dept_id || '',
    branch_id: user?.branch_id || '',
    joining_date: user?.joining_date ? user.joining_date.split('T')[0] : '',
    employment_type: user?.employment_type || '',
    team: user?.team || '',
    employee_id: user?.employee_id || '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateUser(user.id, form);
      Alert.alert('Success', 'Organization details updated successfully.');
      if (onRefresh) onRefresh();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update organization details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.primary }]}>
      {/* Reporting Structure Card */}
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.header}>
          <Feather name="users" size={16} color="#4F46E5" />
          <Text style={styles.title}>Reporting Structure</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.reportBox}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>
                {user?.username?.charAt(0).toLowerCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.reportName}>{user?.username} (this user)</Text>
              <Text style={styles.reportRole}>{user?.userlevel || 'user'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Organization Details Card */}
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.header}>
          <Feather name="list" size={16} color="#4F46E5" />
          <Text style={styles.title}>Organization Details</Text>
        </View>
        <View style={styles.content}>
          
          <View style={styles.row}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Designation</Text>
              <View style={styles.inputWithIcon}>
                <TextInput style={styles.inputFlex} value={form.designation} onChangeText={(v) => handleChange('designation', v)} placeholder="Select Designation" />
                <Feather name="chevron-down" size={16} color="#94A3B8" />
              </View>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Department</Text>
              <View style={styles.inputWithIcon}>
                <TextInput style={styles.inputFlex} value={form.dept_id} onChangeText={(v) => handleChange('dept_id', v)} placeholder="-- None --" />
                <Feather name="chevron-down" size={16} color="#94A3B8" />
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Branch</Text>
              <View style={styles.inputWithIcon}>
                <TextInput style={styles.inputFlex} value={form.branch_id} onChangeText={(v) => handleChange('branch_id', v)} placeholder="Select Branch" />
                <Feather name="chevron-down" size={16} color="#94A3B8" />
              </View>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Location</Text>
              <View style={[styles.inputWithIcon, styles.inputDisabled]}>
                <TextInput style={styles.inputFlex} placeholder="Select Location" editable={false} />
                <Feather name="chevron-down" size={16} color="#CBD5E1" />
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Joining Date</Text>
              <View style={styles.inputWithIcon}>
                <TextInput style={styles.inputFlex} value={form.joining_date} onChangeText={(v) => handleChange('joining_date', v)} placeholder="dd-mm-yyyy" />
                <Feather name="calendar" size={16} color="#94A3B8" />
              </View>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Employment Type</Text>
              <View style={styles.inputWithIcon}>
                <TextInput style={styles.inputFlex} value={form.employment_type} onChangeText={(v) => handleChange('employment_type', v)} placeholder="Select" />
                <Feather name="chevron-down" size={16} color="#94A3B8" />
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Team</Text>
              <TextInput style={styles.input} value={form.team} onChangeText={(v) => handleChange('team', v)} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Employee ID</Text>
              <TextInput style={styles.input} value={form.employee_id} onChangeText={(v) => handleChange('employee_id', v)} />
              <Text style={styles.hint}>Unique across the company</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.btnOutline} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#4F46E5" size="small" />
            ) : (
              <>
                <Feather name="save" size={16} color="#4F46E5" />
                <Text style={styles.btnOutlineText}>Save Organization</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: colors.bg.secondary, // Matching white header from screenshot
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  content: {
    padding: 16,
  },
  reportBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4F46E5', // Blue border
    backgroundColor: colors.bg.primary, // Light gray background
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#4F46E5',
    fontWeight: '500',
    fontSize: 14,
  },
  reportName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  reportRole: {
    fontSize: 12,
    color: colors.text.muted,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldGroup: {
    flex: 1,
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: 6,
  },
  hint: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text.primary,
    backgroundColor: colors.bg.secondary,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 6,
    backgroundColor: colors.bg.secondary,
    paddingHorizontal: 12,
    height: 40,
  },
  inputDisabled: {
    backgroundColor: colors.bg.primary,
  },
  inputFlex: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    height: '100%',
  },
  btnOutline: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    gap: 8,
  },
  btnOutlineText: {
    color: '#4F46E5',
    fontWeight: '500',
    fontSize: 13,
  }
});
