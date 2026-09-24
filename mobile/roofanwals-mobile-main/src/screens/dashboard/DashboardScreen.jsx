import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, Modal
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { dashboardService } from '../../services/dashboard';
import TopBar from '../../components/TopBar';
import DashPanel from '../../components/dashboard/DashPanel';
import StatTile from '../../components/dashboard/StatTile';
import TrendChart from '../../components/dashboard/TrendChart';
import SourceDonut from '../../components/dashboard/SourceDonut';
import ProgressBarList from '../../components/dashboard/ProgressBarList';
import AttentionRow from '../../components/dashboard/AttentionRow';
import RecentList from '../../components/dashboard/RecentList';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const GREETING = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [overview, setOverview]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [currentDashboard, setCurrentDashboard] = useState(
    user?.userlevel === 'Super Admin' ? 'Superadmin Dashboard' : 
    user?.userlevel === 'Manager' ? 'Manager Dashboard' : 
    'Employee Dashboard'
  );

  const loadData = useCallback(async () => {
    try {
      const data = await dashboardService.getOverview();
      setOverview(data || {});
    } catch (e) {
      console.warn('Dashboard load error', e?.message);
      setOverview({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const firstName = user?.name?.split(' ')[0] || user?.firstName || 'there';
  const counts = overview?.counts || {};
  const sparks = overview?.sparklines || {};
  const themed = StyleSheet.create({
    root:  { flex: 1, backgroundColor: colors.bg.primary },
    date:  { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
    greet: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
    tilesRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    grid2:    { flexDirection: 'row', gap: spacing.sm },
    grid2Item:{ flex: 1 },
  });

  return (
    <View style={themed.root}>
      {/* Web-style header — hugs the very top of the screen */}
      <TopBar onOpenDrawer={() => navigation.openDrawer()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting row */}
        <View style={styles.greetRow}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} 
              onPress={() => setDropdownVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={themed.greet}>{currentDashboard}</Text>
              <Feather name="chevron-down" size={20} color={colors.text.primary} style={{ marginTop: 2 }} />
            </TouchableOpacity>
            <Text style={themed.date}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Profile')}>
            <View style={[styles.avatar, { backgroundColor: colors.brand.primary + '30' }]}>
              <Text style={[styles.avatarText, { color: colors.brand.light }]}>
                {(user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="large" color={colors.brand.primary} />
          </View>
        ) : (
          <>
            {/* ---- Headline stat tiles ---- */}
            <View style={themed.tilesRow}>
              <StatTile icon="filter" label="Leads" color="#3987E5"
                value={counts.leads ?? 0} spark={sparks.leads}
                onPress={() => navigation.navigate('Leads')} />
              <StatTile icon="briefcase" label="Opportunities" color="#199E70"
                value={counts.opportunities ?? 0} spark={sparks.opportunities}
                onPress={() => navigation.navigate('Opportunities')} />
            </View>
            <View style={themed.tilesRow}>
              <StatTile icon="layout" label="Projects" color="#9085E9"
                value={counts.projects ?? 0} spark={sparks.projects}
                onPress={() => navigation.navigate('Projects')} />
              <StatTile icon="users" label="Users" color="#C98500"
                value={counts.users ?? 0} spark={sparks.users} />
            </View>
            <View style={themed.tilesRow}>
              <StatTile icon="user-check" label="Channel partners" color="#D95926"
                value={counts.channelPartners ?? 0} spark={sparks.channelPartners}
                onPress={() => navigation.navigate('ChannelPartners')} />
              <StatTile icon="user-plus" label="Customers" color="#D55181"
                value={counts.customers ?? 0} spark={sparks.customers}
                onPress={() => navigation.navigate('Customers')} />
            </View>
            <View style={themed.tilesRow}>
              <StatTile icon="trending-up" label="Lead conversion" color="#199E70"
                value={`${overview?.conversion?.rate ?? 0}%`} spark={sparks.leads}
                onPress={() => navigation.navigate('Reports')} />
            </View>

            {/* ---- Leads and opportunities trend ---- */}
            <DashPanel icon="activity" title="Leads and opportunities" subtitle="The last twelve months">
              <TrendChart trend={overview?.trend || []} />
            </DashPanel>

            {/* ---- Where leads come from ---- */}
            <DashPanel icon="globe" title="Where leads come from" subtitle="Leads by primary source">
              <SourceDonut data={overview?.leadsBySource || []} />
            </DashPanel>

            {/* ---- Pipelines / breakdowns ---- */}
            <View style={themed.grid2}>
              <DashPanel icon="briefcase" title="Opportunity pipeline" subtitle="By stage" style={themed.grid2Item}>
                <ProgressBarList data={overview?.opportunitiesByStage || []} emptyText="No opportunities yet" />
              </DashPanel>
              <DashPanel icon="filter" title="Lead status" subtitle="Across every lead" style={themed.grid2Item}>
                <ProgressBarList data={overview?.leadsByStatus || []} emptyText="No leads yet" color="#2DD4BF" />
              </DashPanel>
            </View>
            <View style={themed.grid2}>
              <DashPanel icon="layout" title="Projects" subtitle="By status" style={themed.grid2Item}>
                <ProgressBarList data={overview?.projectsByStatus || []} emptyText="No projects yet" color="#9085E9" />
              </DashPanel>
              <DashPanel icon="user" title="Lead owners" subtitle="Who holds the pipeline" style={themed.grid2Item}>
                <ProgressBarList data={overview?.leadsByOwner || []} emptyText="No owners yet" color="#C98500" />
              </DashPanel>
            </View>

            {/* ---- What needs attention + Booked value ---- */}
            <DashPanel icon="bell" title="What needs attention" subtitle="Follow-ups and site visits">
              <AttentionRow workload={overview?.workload || {}} />
            </DashPanel>

            <DashPanel icon="dollar-sign" title="Booked value" subtitle="Opportunity booking amounts">
              {overview?.revenue?.booked > 0 ? (
                <>
                  <Text style={[styles.revenueValue, { color: colors.text.primary }]}>
                    ₹{new Intl.NumberFormat('en-IN').format(overview.revenue.booked)}
                  </Text>
                  <Text style={[styles.revenueMeta, { color: colors.text.muted }]}>
                    Recorded on {overview.revenue.recordedOn} of {overview.revenue.outOf} opportunities
                  </Text>
                </>
              ) : (
                <Text style={[styles.emptyText, { color: colors.text.muted }]}>
                  None of the opportunities has a booking amount recorded, so there is no value to total yet.
                </Text>
              )}
            </DashPanel>

            {/* ---- Recent leads ---- */}
            <DashPanel icon="user" title="Recent leads"
              actionLabel="View all" onAction={() => navigation.navigate('Leads')}>
              <RecentList kind="lead" items={overview?.recentLeads || []}
                onPressItem={(lead) => navigation.navigate('LeadDetail', { id: lead.id, name: lead.name || lead.fullName })} />
            </DashPanel>

            {/* ---- Recent opportunities ---- */}
            <DashPanel icon="briefcase" title="Recent opportunities"
              actionLabel="View all" onAction={() => navigation.navigate('Opportunities')}>
              <RecentList kind="opportunity" items={overview?.recentOpportunities || []}
                onPressItem={(opp) => navigation.navigate('OpportunityDetail', { id: opp.id, name: opp.opportunityName || opp.oppId })} />
            </DashPanel>

            {/* ---- Recent activity ---- */}
            <DashPanel icon="activity" title="Recent activity" subtitle="Across every lead">
              <ActivityFeed items={overview?.recentActivity || []} />
            </DashPanel>

            <Text style={[styles.copyright, { color: colors.text.muted }]}>
              Copyright © {new Date().getFullYear()} NexorCRM
            </Text>
            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>

      {/* Role Dropdown Modal */}
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setDropdownVisible(false)}>
          <View style={[styles.dropdownMenu, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
            {['Superadmin Dashboard', 'Admin Dashboard', 'Manager Dashboard', 'Employee Dashboard'].map((role) => (
              <TouchableOpacity 
                key={role} 
                style={styles.dropdownItem}
                onPress={() => {
                  setCurrentDashboard(role);
                  setDropdownVisible(false);
                }}
              >
                <Text style={[styles.dropdownItemText, { color: currentDashboard === role ? colors.brand.primary : colors.text.primary }]}>
                  {role}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.screenH, paddingTop: spacing.md },

  greetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  avatar: {
    width: 40, height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 130, // roughly below the title
    left: 16,
    width: 220,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
  },

  loadingRow: { height: 240, alignItems: 'center', justifyContent: 'center' },

  revenueValue: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginBottom: 4 },
  revenueMeta:  { fontSize: typography.size.xs },
  emptyText:    { fontSize: typography.size.sm, lineHeight: 19 },
  copyright:    { fontSize: typography.size.xs, textAlign: 'center', marginTop: spacing.sm },
});
