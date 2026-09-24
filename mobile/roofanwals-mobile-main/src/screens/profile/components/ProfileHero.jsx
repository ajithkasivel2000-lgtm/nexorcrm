import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';

export default function ProfileHero({ user, overview }) {
  const { colors } = useTheme();

  const initials = (user?.name || user?.firstName || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const online = overview?.activeSessions > 0;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const themed = StyleSheet.create({
    container: {
      backgroundColor: colors.bg.secondary,
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
      flexDirection: 'column',
      gap: spacing.md,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarWrapper: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#EEF2FF', // Indigo 50
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    avatarText: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#4F46E5', // Indigo 600
    },
    userInfo: {
      flex: 1,
    },
    username: {
      fontSize: 14,
      color: colors.text.muted,
      marginBottom: 4,
    },
    badgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    roleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#EEF2FF',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      gap: 4,
    },
    roleText: {
      fontSize: 12,
      color: '#4F46E5',
      fontWeight: '600',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: online ? '#F0FDF4' : '#F8FAFC',
      borderWidth: 1,
      borderColor: online ? '#86EFAC' : '#E2E8F0',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: online ? '#22C55E' : '#94A3B8',
    },
    statusText: {
      fontSize: 12,
      color: online ? '#166534' : '#64748B',
      fontWeight: '500',
    },
    bottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      paddingTop: spacing.md,
    },
    statItem: {
      flex: 1,
    },
    statLabel: {
      fontSize: 10,
      color: colors.text.muted,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    statValue: {
      fontSize: 13,
      color: colors.text.primary,
      fontWeight: '500',
    },
  });

  return (
    <View style={themed.container}>
      <View style={themed.topRow}>
        <View style={themed.avatarWrapper}>
          <Text style={themed.avatarText}>{initials}</Text>
        </View>
        <View style={themed.userInfo}>
          <Text style={themed.username}>@{user?.username || 'user'}</Text>
          <View style={themed.badgesRow}>
            <View style={themed.roleBadge}>
              <Feather name="shield" size={12} color="#4F46E5" />
              <Text style={themed.roleText}>{user?.designation || 'User'}</Text>
            </View>
            <View style={themed.statusBadge}>
              <View style={themed.statusDot} />
              <Text style={themed.statusText}>{online ? 'Online' : 'Offline'}</Text>
            </View>
          </View>
        </View>
      </View>
      
      <View style={themed.bottomRow}>
        <View style={themed.statItem}>
          <Text style={themed.statLabel}>Last Login</Text>
          <Text style={themed.statValue}>{online ? 'Now' : formatDate(user?.lastLoginAt)}</Text>
        </View>
        <View style={themed.statItem}>
          <Text style={themed.statLabel}>Account Created</Text>
          <Text style={themed.statValue}>{formatDate(user?.createdAt)}</Text>
        </View>
      </View>
    </View>
  );
}
