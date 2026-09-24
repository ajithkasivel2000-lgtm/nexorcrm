import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function RolesPermissionsTab({ user }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const isSuperAdmin = String(user?.userlevel || '').toLowerCase() === 'superadmin' || user?.username === 'admin';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="shield" size={16} color="#8B5CF6" />
        <Text style={styles.title}>Page Permissions</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.desc}>
          Set per user, not per role. What is ticked here is what this person can reach — the menu, the buttons and the API all read the same answer.
        </Text>
        
        {isSuperAdmin ? (
          <View style={styles.alert}>
            <Feather name="info" size={16} color="#4F46E5" />
            <Text style={styles.alertText}>
              <Text style={{ fontWeight: 'bold' }}>{user?.username || 'admin'}</Text> is the super admin and is never restricted. Permissions do not apply to this account.
            </Text>
          </View>
        ) : (
          <View style={styles.roleBox}>
            <Text style={styles.roleLabel}>Assigned Role</Text>
            <Text style={styles.roleValue}>{user?.userlevel || 'User'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 32,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  content: {
    padding: 16,
  },
  desc: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 16,
    lineHeight: 18,
  },
  alert: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
    gap: 12,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    color: '#3730A3',
    lineHeight: 20,
  },
  roleBox: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 6,
    padding: 16,
  },
  roleLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: 4,
  },
  roleValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  }
});
