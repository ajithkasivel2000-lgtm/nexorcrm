import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateUser } from '../../../services/users';
import { getApiBaseUrl, setBaseUrl } from '../../../services/api';

export default function ProfileTab({ user, onRefresh }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    preferredName: user?.preferredName || '',
    username: user?.username || '',
    employee_id: user?.employee_id || '',
    dob: user?.dob ? (typeof user.dob === 'string' ? user.dob.split('T')[0] : new Date(user.dob).toISOString().split('T')[0]) : '',
    gender: user?.gender || '',
    password: '',
    confirmPassword: '',
    email: user?.email || '',
    phone: user?.phone || '',
    alternateEmail: user?.alternateEmail || '',
    alternatePhone: user?.alternatePhone || '',
    address: user?.address || '',
    city: user?.city || '',
    state: user?.state || '',
    country: user?.country || '',
    pincode: user?.pincode || '',
    serverUrl: getApiBaseUrl() || '',
  });
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (form.password && form.password !== form.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    try {
      setSaving(true);
      
      // Handle Server URL save
      if (form.serverUrl && form.serverUrl !== getApiBaseUrl()) {
        setBaseUrl(form.serverUrl);
        await AsyncStorage.setItem('custom_server_url', form.serverUrl);
      }

      // Handle User profile save
      const payload = { ...form };
      delete payload.serverUrl; // Don't send this to backend
      if (!payload.password) {
        delete payload.password;
      }
      delete payload.confirmPassword;

      await updateUser(user.id, payload);
      Alert.alert('Success', 'Profile updated successfully.');
      if (onRefresh) onRefresh();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update profile. If you changed the server URL, you may need to restart the app or sign in again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>App Connection Settings</Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Server Connection URL</Text>
        <View style={styles.inputWithIcon}>
          <Feather name="server" size={16} color="#94A3B8" style={styles.icon} />
          <TextInput 
            style={styles.inputFlex} 
            value={form.serverUrl} 
            onChangeText={(v) => handleChange('serverUrl', v)} 
            placeholder="http://192.168.1.10:7012/api" 
            autoCapitalize="none"
          />
        </View>
        <Text style={styles.hint}>Update to switch between live server and local testing</Text>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Profile Information</Text>

      {/* Row 1: First Name, Last Name */}
      <View style={styles.row}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} value={form.firstName} onChangeText={(v) => handleChange('firstName', v)} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} value={form.lastName} onChangeText={(v) => handleChange('lastName', v)} />
        </View>
      </View>

      {/* Row 2: Preferred Name, Username */}
      <View style={styles.row}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Preferred Name</Text>
          <TextInput style={styles.input} value={form.preferredName} onChangeText={(v) => handleChange('preferredName', v)} />
          <Text style={styles.hint}>How they are addressed in the app</Text>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Username *</Text>
          <View style={styles.inputWithIcon}>
            <Feather name="user" size={16} color="#94A3B8" style={styles.icon} />
            <TextInput style={styles.inputFlex} value={form.username} onChangeText={(v) => handleChange('username', v)} />
          </View>
          <Text style={styles.hint}>Min 5 characters</Text>
        </View>
      </View>

      {/* Row 3: Employee ID, Date of Birth */}
      <View style={styles.row}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Employee ID</Text>
          <TextInput style={styles.input} value={form.employee_id} onChangeText={(v) => handleChange('employee_id', v)} />
          <Text style={styles.hint}>Optional, must be unique</Text>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Date of Birth</Text>
          <View style={styles.inputWithIcon}>
            <TextInput style={styles.inputFlex} value={form.dob} onChangeText={(v) => handleChange('dob', v)} placeholder="dd-mm-yyyy" />
            <Feather name="calendar" size={16} color="#94A3B8" style={styles.iconRight} />
          </View>
        </View>
      </View>

      {/* Row 4: Gender, New Password */}
      <View style={styles.row}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Gender</Text>
          <TextInput style={styles.input} value={form.gender} onChangeText={(v) => handleChange('gender', v)} placeholder="Select" />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputWithIcon}>
            <Feather name="lock" size={16} color="#94A3B8" style={styles.icon} />
            <TextInput 
              style={styles.inputFlex} 
              value={form.password} 
              onChangeText={(v) => handleChange('password', v)} 
              placeholder="Leave blank to keep current" 
              secureTextEntry={!showPassword} 
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Feather name={showPassword ? "eye" : "eye-off"} size={16} color="#94A3B8" style={styles.iconRight} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Min 10 chars · 1 number · 1 special character</Text>
        </View>
      </View>

      {/* Row 5: Confirm Password, Email */}
      <View style={styles.row}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputWithIcon}>
            <Feather name="lock" size={16} color="#94A3B8" style={styles.icon} />
            <TextInput 
              style={styles.inputFlex} 
              value={form.confirmPassword} 
              onChangeText={(v) => handleChange('confirmPassword', v)} 
              placeholder="Confirm Password" 
              secureTextEntry={!showPassword} 
            />
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>E-mail *</Text>
          <View style={styles.inputWithIcon}>
            <Feather name="mail" size={16} color="#94A3B8" style={styles.icon} />
            <TextInput style={styles.inputFlex} value={form.email} onChangeText={(v) => handleChange('email', v)} autoCapitalize="none" keyboardType="email-address" />
          </View>
        </View>
      </View>

      {/* Row 6: Alternate Email, Phone */}
      <View style={styles.row}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Alternate E-mail</Text>
          <View style={styles.inputWithIcon}>
            <Feather name="mail" size={16} color="#94A3B8" style={styles.icon} />
            <TextInput style={styles.inputFlex} value={form.alternateEmail} onChangeText={(v) => handleChange('alternateEmail', v)} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" />
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone (Mobile)</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={(v) => handleChange('phone', v)} keyboardType="phone-pad" />
        </View>
      </View>

      {/* Row 7: Alternate Phone */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Alternate Phone</Text>
        <TextInput style={styles.input} value={form.alternatePhone} onChangeText={(v) => handleChange('alternatePhone', v)} keyboardType="phone-pad" />
      </View>

      {/* Address */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Address</Text>
        <TextInput style={styles.input} value={form.address} onChangeText={(v) => handleChange('address', v)} />
      </View>

      {/* Row 8: City, State */}
      <View style={styles.row}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>City</Text>
          <TextInput style={styles.input} value={form.city} onChangeText={(v) => handleChange('city', v)} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>State</Text>
          <TextInput style={styles.input} value={form.state} onChangeText={(v) => handleChange('state', v)} />
        </View>
      </View>

      {/* Row 9: Country, Pincode */}
      <View style={styles.row}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Country</Text>
          <TextInput style={styles.input} value={form.country} onChangeText={(v) => handleChange('country', v)} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Pincode</Text>
          <TextInput style={styles.input} value={form.pincode} onChangeText={(v) => handleChange('pincode', v)} />
        </View>
      </View>

      <TouchableOpacity style={styles.btnOutline} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#4F46E5" size="small" />
        ) : (
          <>
            <Feather name="save" size={16} color="#4F46E5" />
            <Text style={styles.btnOutlineText}>Save Profile</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
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
  inputFlex: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    height: '100%',
  },
  icon: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
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
