import React, { useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { resetUserPassword, forcePasswordChange, revokeUserSessions } from '../../../services/users';

export default function SecurityTab({ overview }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [revokeModalVisible, setRevokeModalVisible] = useState(false);
  const [resetMode, setResetMode] = useState('generate'); // 'generate' or 'manual'
  const [newPassword, setNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const failedTimestamp = formatDate(overview?.user?.lastFailedLoginAt);
  const loginTimestamp = formatDate(overview?.user?.lastLoginAt);

  const handleForcePasswordChange = () => {
    Alert.alert(
      'Force Password Change',
      'Are you sure you want to force this user to change their password at next login?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm', 
          style: 'destructive',
          onPress: async () => {
            try {
              await forcePasswordChange(overview.user.id);
              Alert.alert('Success', 'User forced to change password at next login.');
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Could not force password change.');
            }
          }
        }
      ]
    );
  };

  const handleRevokeSessions = () => {
    setRevokeModalVisible(true);
  };

  const confirmRevokeSessions = async () => {
    try {
      setIsRevoking(true);
      await revokeUserSessions(overview.user.id);
      setRevokeModalVisible(false);
      Alert.alert('Success', 'All sessions revoked.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not revoke sessions.');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleResetPassword = async () => {
    if (resetMode === 'manual' && newPassword.length < 10) {
      Alert.alert('Error', 'Password must be at least 10 characters.');
      return;
    }

    try {
      setIsResetting(true);
      const payload = { generate: resetMode === 'generate' };
      if (resetMode === 'manual') {
        payload.newPassword = newPassword;
      }
      
      const res = await resetUserPassword(overview.user.id, payload);
      
      setResetModalVisible(false);
      
      if (payload.generate && res.temporaryPassword) {
        Alert.alert(
          'Password Reset Successful',
          `The temporary password is:\n\n${res.temporaryPassword}\n\nPlease share this securely. The user will be forced to change it on next login.`
        );
      } else {
        Alert.alert('Success', 'Password has been reset.');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not reset password.');
    } finally {
      setIsResetting(false);
      setNewPassword('');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.primary }]}>
      {/* Account Security Card */}
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.header}>
          <Feather name="lock" size={16} color="#4F46E5" />
          <Text style={styles.title}>Account Security</Text>
        </View>
        <View style={styles.grid}>
          {/* Account Status */}
          <View style={styles.gridItem}>
            <View style={styles.labelRow}>
              <Feather name="user-check" size={12} color="#94A3B8" />
              <Text style={styles.label}>ACCOUNT STATUS</Text>
            </View>
            <View style={styles.statusPill}>
              <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
              <Text style={styles.statusText}>{overview?.user?.userlevel || 'User'}</Text>
            </View>
          </View>
          
          {/* Lock Status */}
          <View style={styles.gridItem}>
            <View style={styles.labelRow}>
              <Feather name="lock" size={12} color="#94A3B8" />
              <Text style={styles.label}>LOCK STATUS</Text>
            </View>
            <View style={[styles.statusPill, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}>
              <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
              <Text style={[styles.statusText, { color: '#166534' }]}>Not locked</Text>
            </View>
          </View>

          {/* Failed Attempts */}
          <View style={styles.gridItem}>
            <View style={styles.labelRow}>
              <Feather name="alert-circle" size={12} color="#94A3B8" />
              <Text style={styles.label}>FAILED ATTEMPTS</Text>
            </View>
            <Text style={styles.value}>{overview?.failedCount || 0}</Text>
            {failedTimestamp && <Text style={styles.subtext}>Last at {failedTimestamp}</Text>}
          </View>

          {/* Password Changed */}
          <View style={styles.gridItem}>
            <View style={styles.labelRow}>
              <Feather name="key" size={12} color="#94A3B8" />
              <Text style={styles.label}>PASSWORD CHANGED</Text>
            </View>
            <Text style={styles.value}>{formatDate(overview?.user?.passwordChangedAt) || 'Not on record'}</Text>
          </View>

          {/* Last Login IP */}
          <View style={styles.gridItem}>
            <View style={styles.labelRow}>
              <Feather name="monitor" size={12} color="#94A3B8" />
              <Text style={styles.label}>LAST LOGIN IP</Text>
            </View>
            <Text style={styles.value}>{overview?.user?.lastLoginIp || 'Not recorded'}</Text>
            {loginTimestamp && <Text style={styles.subtext}>{loginTimestamp}</Text>}
          </View>

          {/* Last Failed IP */}
          <View style={styles.gridItem}>
            <View style={styles.labelRow}>
              <Feather name="shield-off" size={12} color="#94A3B8" />
              <Text style={styles.label}>LAST FAILED IP</Text>
            </View>
            <Text style={styles.value}>{overview?.user?.lastFailedIp || '::1'}</Text>
          </View>
        </View>
        <Text style={styles.footerText}>
          Email/mobile verification and two-factor authentication are not tracked by this system, so no status is shown for them. Passwords are stored as bcrypt hashes and never displayed.
        </Text>
      </View>

      {/* Password Actions Card */}
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.header}>
          <Feather name="key" size={16} color="#4F46E5" />
          <Text style={styles.title}>Password Actions</Text>
        </View>
        <View style={styles.content}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setResetModalVisible(true)}>
            <View style={styles.actionIconWrap}>
              <Feather name="edit-2" size={14} color="#64748B" />
            </View>
            <Text style={styles.actionText}>Reset Password...</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleForcePasswordChange}>
            <View style={styles.actionIconWrap}>
              <Feather name="refresh-cw" size={14} color="#64748B" />
            </View>
            <Text style={styles.actionText}>Force Password Change</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleRevokeSessions}>
            <View style={styles.actionIconWrap}>
              <Feather name="log-out" size={14} color="#64748B" />
            </View>
            <Text style={styles.actionText}>Revoke Sessions</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Account State Card */}
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.header}>
          <Feather name="unlock" size={16} color="#4F46E5" />
          <Text style={styles.title}>Account State</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.stateText}>Account is not locked and has no failed attempts on record.</Text>
          <Text style={styles.stateSub}>No status change recorded yet.</Text>
        </View>
      </View>

      {/* Reset Password Modal */}
      <Modal visible={resetModalVisible} transparent animationType="fade" onRequestClose={() => setResetModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset {overview?.user?.username}'s password</Text>
              <TouchableOpacity onPress={() => setResetModalVisible(false)} style={styles.modalCloseBtn}>
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.segmentControl}>
                <TouchableOpacity 
                  style={[styles.segmentBtn, resetMode === 'generate' && styles.segmentBtnActive]}
                  onPress={() => setResetMode('generate')}
                >
                  <Text style={[styles.segmentText, resetMode === 'generate' && styles.segmentTextActive]}>
                    Generate temporary password
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.segmentBtn, resetMode === 'manual' && styles.segmentBtnActive]}
                  onPress={() => setResetMode('manual')}
                >
                  <Text style={[styles.segmentText, resetMode === 'manual' && styles.segmentTextActive]}>
                    I'll set it
                  </Text>
                </TouchableOpacity>
              </View>

              {resetMode === 'generate' ? (
                <>
                  <Text style={styles.modalDesc}>
                    A readable temporary password is generated, shown once for you to hand over. The user must change it at next sign-in.
                  </Text>
                  <Text style={styles.modalDesc}>
                    All of the user's live sessions are revoked when the password changes.
                  </Text>
                </>
              ) : (
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>New Password</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    secureTextEntry
                  />
                  <Text style={styles.inputHint}>Min 10 chars · 1 number · 1 special character</Text>
                </View>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setResetModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSubmitBtn} 
                onPress={handleResetPassword}
                disabled={isResetting}
              >
                {isResetting ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <Text style={styles.modalSubmitText}>Reset & revoke sessions</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Revoke Sessions Modal */}
      <Modal visible={revokeModalVisible} transparent animationType="fade" onRequestClose={() => setRevokeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Revoke sessions</Text>
                <Text style={styles.modalSubtitle}>Sign this user out of their devices.</Text>
              </View>
              <TouchableOpacity onPress={() => setRevokeModalVisible(false)} style={styles.modalCloseBtn}>
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalDesc}>
                Every live session for <Text style={{fontWeight: '700', color: colors.text.primary}}>{overview?.user?.username}</Text> will be ended.
              </Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRevokeModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalSubmitBtn, { borderColor: '#EF4444' }]} 
                onPress={confirmRevokeSessions}
                disabled={isRevoking}
              >
                {isRevoking ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Feather name="log-out" size={14} color="#EF4444" />
                    <Text style={[styles.modalSubmitText, { color: '#EF4444', marginLeft: 6 }]}>Revoke all</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.bg.secondary,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  content: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '50%',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    color: colors.text.muted,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  subtext: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#22C55E',
  },
  footerText: {
    fontSize: 11,
    color: colors.text.muted,
    padding: 16,
    lineHeight: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.secondary,
    borderRadius: 6,
    paddingVertical: 12,
    marginBottom: 8,
  },
  actionIconWrap: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '500',
    textAlign: 'center',
    paddingRight: 40,
  },
  stateText: {
    fontSize: 13,
    color: colors.text.primary,
    marginBottom: 4,
  },
  stateSub: {
    fontSize: 12,
    color: colors.text.muted,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: colors.bg.secondary,
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  segmentControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 6,
    marginBottom: 16,
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
  },
  segmentBtnActive: {
    backgroundColor: '#4F46E5',
  },
  segmentText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#FFF',
  },
  modalDesc: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  inputWrap: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: colors.text.primary,
    marginBottom: 6,
    fontWeight: '500',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 13,
    color: colors.text.primary,
  },
  inputHint: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 6,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'center', // Centered as in screenshot
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: 12,
  },
  modalCancelBtn: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.bg.secondary,
  },
  modalCancelText: {
    color: colors.text.secondary,
    fontWeight: '500',
    fontSize: 13,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4F46E5',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.bg.secondary,
  },
  modalSubmitText: {
    color: '#4F46E5',
    fontWeight: '500',
    fontSize: 13,
  }
});
