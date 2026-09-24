import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function DangerZoneTab({ user }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const handleAction = (action) => {
    Alert.alert(
      'Confirm Action',
      `Are you sure you want to ${action.toLowerCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => console.log(`${action} confirmed`) }
      ]
    );
  };

  const renderRow = (title, sub, btnText, btnIcon, action) => (
    <View style={styles.row}>
      <View style={styles.textWrap}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      {btnText && (
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction(action || btnText)}>
          <Feather name={btnIcon} size={14} color="#64748B" />
          <Text style={styles.actionBtnText}>{btnText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.primary }]}>
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.header}>
          <Feather name="slash" size={16} color="#EF4444" />
          <Text style={styles.title}>Danger Zone — these actions are logged and cannot be undone casually</Text>
        </View>

        <View style={styles.content}>
          {renderRow(
            'Disable / Suspend Account',
            'Blocks sign-in and ends live sessions. Reversible from this page. A reason is required and is recorded.',
            'Suspend...',
            'eye-off',
            'Suspend Account'
          )}
          {renderRow(
            'Ban User',
            'Hard block on sign-in. Reversible via Enable Account.',
            'Ban...',
            'slash',
            'Ban User'
          )}
          {renderRow(
            'Revoke All Sessions',
            'Signs the user out of every device.',
            'Revoke...',
            'log-out',
            'Revoke Sessions'
          )}
          {renderRow(
            'Reset Security',
            'Clears the failed-attempt counter and lock, then revokes all sessions.',
            'Reset',
            'refresh-cw',
            'Reset Security'
          )}
          {renderRow(
            'Delete User',
            'Permanent. Their leads, opportunities and partners are handed to another user first — nothing here is a foreign key.',
            'Delete...', // Added button just in case, though cut off in screenshot
            'trash-2',
            'Delete User'
          )}
        </View>
      </View>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: '#FECACA', // Light red border
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA', // Light red border
    backgroundColor: '#FEF2F2', // Light red background
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444', // Red text
    lineHeight: 18,
  },
  content: {
    paddingBottom: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  textWrap: {
    flex: 1,
    paddingRight: 16,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  rowSub: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bg.secondary,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.primary,
  }
});
