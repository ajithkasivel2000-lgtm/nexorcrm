import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import TabStrip from '../../components/TabStrip';
import { getUserOverview, getUserStats } from '../../services/users';

// Components
import ProfileHero from './components/ProfileHero';
import ProfileStatsStrip from './components/ProfileStatsStrip';
import SecurityHealthCard from './components/SecurityHealthCard';
import CrmActivityCard from './components/CrmActivityCard';
import AuditTrailCard from './components/AuditTrailCard';
import StatusHistoryCard from './components/StatusHistoryCard';

import ProfileTab from './tabs/ProfileTab';
import RolesPermissionsTab from './tabs/RolesPermissionsTab';
import OrganizationTab from './tabs/OrganizationTab';
import SecurityTab from './tabs/SecurityTab';
import SessionsTab from './tabs/SessionsTab';
import ActivityTab from './tabs/ActivityTab';
import NotificationsTab from './tabs/NotificationsTab';
import DangerZoneTab from './tabs/DangerZoneTab';

const TABS = [
  { id: 'Overview', label: 'Overview', count: '' },
  { id: 'Profile', label: 'Profile', count: '' },
  { id: 'Roles & Permissions', label: 'Roles & Permissions', count: '' },
  { id: 'Organization', label: 'Organization', count: '' },
  { id: 'Security', label: 'Security', count: '' },
  { id: 'Sessions', label: 'Sessions', count: '' },
  { id: 'Activity', label: 'Activity', count: '' },
  { id: 'Notifications', label: 'Notifications', count: '' },
  { id: 'Danger Zone', label: 'Danger Zone', count: '' }
];

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // user.id might not exist if it's 'me', but backend supports /users/:id/overview
      // We assume user.id is available, otherwise default to 'me' in service
      const targetId = user?.id || 'me';
      const [overviewData, statsData] = await Promise.all([
        getUserOverview(targetId),
        getUserStats(targetId).catch(() => null) // Stats might fail if not fully implemented for all roles
      ]);
      setOverview(overviewData);
      setStats(statsData);
    } catch (err) {
      console.error('Error loading profile overview:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  // The overview endpoint returns { user: {...}, manager: {...}, department: {...}, etc }
  // We use the enriched user data from the overview, falling back to auth context user
  const displayUser = overview?.user || user;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.primary }]}>
      <TopBar onOpenDrawer={() => navigation?.openDrawer?.()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <ProfileHero user={displayUser} overview={overview} />

        {/* Tab Navigation */}
        <TabStrip 
          tabs={TABS} 
          activeTab={activeTab} 
          onChange={setActiveTab} 
        />

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'Overview' ? (
            <>
              {/* Horizontal Stats Strip */}
              <View style={{ marginBottom: 16 }}>
                <ProfileStatsStrip overview={overview} user={displayUser} />
              </View>

              {/* Grid of Cards */}
              <View style={styles.gridContainer}>
                {/* Left Column Equivalent (Stacks vertically on mobile) */}
                <SecurityHealthCard securityScore={overview?.securityScore} />
                <CrmActivityCard stats={stats} />

                {/* Right Column Equivalent */}
                <AuditTrailCard />
              </View>

              {/* Status History */}
              <StatusHistoryCard history={overview?.statusHistory} />
            </>
          ) : activeTab === 'Profile' ? (
            <ProfileTab user={displayUser} onRefresh={load} />
          ) : activeTab === 'Roles & Permissions' ? (
            <RolesPermissionsTab user={displayUser} />
          ) : activeTab === 'Organization' ? (
            <OrganizationTab user={displayUser} overview={overview} onRefresh={load} />
          ) : activeTab === 'Security' ? (
            <SecurityTab overview={overview} />
          ) : activeTab === 'Sessions' ? (
            <SessionsTab user={displayUser} />
          ) : activeTab === 'Activity' ? (
            <ActivityTab user={displayUser} />
          ) : activeTab === 'Notifications' ? (
            <NotificationsTab user={displayUser} />
          ) : activeTab === 'Danger Zone' ? (
            <DangerZoneTab user={displayUser} />
          ) : (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderText}>
                {activeTab} content is not yet implemented on mobile.
              </Text>
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scroll: {
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
  },
  tabContent: {
    paddingTop: 16,
  },
  gridContainer: {
    // Allows vertical stacking on mobile
    flexDirection: 'column',
  },
  placeholderContainer: {
    padding: 32,
    alignItems: 'center',
  },
  placeholderText: {
    color: colors.text.muted,
    fontSize: 14,
    textAlign: 'center',
  }
});
