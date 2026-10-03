import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Feather } from '@expo/vector-icons';

import MainTabs from './MainTabs';
import CampaignLeadsScreen from '../screens/leads/CampaignLeadsScreen';
import ImportLeadsScreen from '../screens/leads/ImportLeadsScreen';
import CustomersScreen from '../screens/customers/CustomersScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import TeamChatScreen from '../screens/chat/TeamChatScreen';
import AssistantScreen from '../screens/assistant/AssistantScreen';
import ChannelPartnersScreen from '../screens/channelPartners/ChannelPartnersScreen';
import RRQScreen from '../screens/rrq/RRQScreen';
import UserAdminScreen from '../screens/settings/UserAdminScreen';
import UserGroupsScreen from '../screens/settings/UserGroupsScreen';
import LeadAssignmentScreen from '../screens/settings/LeadAssignmentScreen';
import RemindersScreen from '../screens/settings/RemindersScreen';
import MailSettingsScreen from '../screens/settings/MailSettingsScreen';
import EmailTemplatesScreen from '../screens/settings/EmailTemplatesScreen';
import RegistrationSettingsScreen from '../screens/settings/RegistrationSettingsScreen';
import SessionSettingsScreen from '../screens/settings/SessionSettingsScreen';
import UserSettingsScreen from '../screens/settings/UserSettingsScreen';
import SecuritySettingsScreen from '../screens/settings/SecuritySettingsScreen';
import LogsScreen from '../screens/settings/LogsScreen';

// Lookups
import ProjectStatusListScreen from '../screens/settings/lookups/ProjectStatusListScreen';
import ProjectTypeListScreen from '../screens/settings/lookups/ProjectTypeListScreen';
import LeadStatusListScreen from '../screens/settings/lookups/LeadStatusListScreen';
import LeadTypeListScreen from '../screens/settings/lookups/LeadTypeListScreen';
import PrimarySourceListScreen from '../screens/settings/lookups/PrimarySourceListScreen';
import SecondarySourceListScreen from '../screens/settings/lookups/SecondarySourceListScreen';
import TertiarySourceListScreen from '../screens/settings/lookups/TertiarySourceListScreen';

const Drawer = createDrawerNavigator();

// Palette (matches web side menu)
const DRAWER_BG = '#0F172A';
const ITEM_INACTIVE = '#94A3B8';
const ITEM_ACTIVE_BG = '#1D4ED8';
const AMBER = '#FBBF24';
const DIVIDER = '#1E293B';

const MENU_ITEMS = [
  { name: 'Dashboard', icon: 'home', route: 'Dashboard' },
  { name: 'Leads', icon: 'filter', route: 'Leads' },
  { name: 'Campaign Leads', icon: 'target', route: 'CampaignLeads' },
  { name: 'Import Leads', icon: 'file-text', route: 'ImportLeads' },
  { name: 'Opportunity', icon: 'briefcase', route: 'Opportunities' },
  { name: 'Customer', icon: 'users', route: 'Customers' },
  { name: 'Bookings & Payments', icon: 'dollar-sign', route: 'Bookings' },
  { name: 'Report', icon: 'bar-chart-2', route: 'Reports' },
  { name: 'Channel Partners', icon: 'user-check', route: 'ChannelPartners' },
  { name: 'Team Chat', icon: 'message-square', route: 'TeamChat' },
  { name: 'Assistant', icon: 'star', route: 'Assistant' },
];

const BOTTOM_MENU_ITEMS = [
  { name: 'RRQ', icon: 'clipboard', route: 'RRQ' },
  { name: 'Projects', icon: 'layout', route: 'Projects' },
  { 
    name: 'Settings', icon: 'settings', route: 'Profile', hasChevron: true, 
    subItems: [
      { name: 'User Admin', route: 'SettingsUserAdmin' },
      { name: 'User Groups', route: 'SettingsUserGroups' },
      { name: 'Lead Assignment', route: 'SettingsLeadAssignment' },
      { name: 'Reminders', route: 'SettingsReminders' },
      { name: 'Mail Settings', route: 'SettingsMail' },
      { name: 'Email Templates', route: 'SettingsEmailTemplates' },
      { name: 'Registration', route: 'SettingsRegistration' },
      { name: 'Session', route: 'SettingsSession' },
      { name: 'User', route: 'SettingsUser' },
      { name: 'Security', route: 'SettingsSecurity' },
      { name: 'Logs', route: 'SettingsLogs' },
    ]
  },
];

function DrawerItem({ item, isActive, onPress, isExpanded }) {
  return (
    <TouchableOpacity
      style={[styles.drawerItem, isActive && styles.drawerItemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {isActive && <View style={styles.activeIndicator} />}
      <View style={styles.drawerItemContent}>
        <Feather
          name={item.icon}
          size={18}
          color={isActive ? AMBER : (isExpanded ? '#FFFFFF' : ITEM_INACTIVE)}
          style={styles.drawerItemIcon}
        />
        <Text style={[styles.drawerItemLabel, isActive && styles.drawerItemLabelActive, isExpanded && { color: '#FFFFFF' }]}>
          {item.name}
        </Text>
        {item.hasChevron && (
          <Feather name={isExpanded ? 'chevron-down' : 'chevron-right'} size={16} color="#64748B" />
        )}
      </View>
    </TouchableOpacity>
  );
}

function CustomDrawerContent(props) {
  const { state, navigation } = props;
  const [expandedItems, setExpandedItems] = React.useState({ Settings: true });

  const getIsActive = (routeName) => {
    try {
      const currentRoute = state.routes[state.index];
      if (currentRoute.name === 'MainTabs' && currentRoute.state) {
        return currentRoute.state.routes[currentRoute.state.index].name === routeName;
      }
      return currentRoute.name === routeName ||
             (routeName === 'Dashboard' && currentRoute.name === 'MainTabs');
    } catch (e) {
      return routeName === 'Dashboard';
    }
  };

  const handleNavigate = (routeName) => {
    // For unimplemented settings routes, just close drawer for now to avoid crashes
    if (routeName.startsWith('Settings') && !['SettingsUserAdmin', 'SettingsUserGroups', 'SettingsLeadAssignment', 'SettingsReminders', 'SettingsMail', 'SettingsEmailTemplates', 'SettingsRegistration', 'SettingsSession', 'SettingsUser', 'SettingsSecurity', 'SettingsLogs'].includes(routeName)) {
      navigation.closeDrawer();
      return;
    }
    // All screens are now inside MainTabs to keep the bottom bar visible
    navigation.navigate('MainTabs', { screen: routeName });
    navigation.closeDrawer();
  };

  const renderMenuItem = (item) => {
    const isExpanded = expandedItems[item.name];
    return (
      <View key={item.name}>
        <DrawerItem
          item={item}
          isActive={getIsActive(item.route)}
          isExpanded={isExpanded}
          onPress={() => {
            if (item.subItems) {
              setExpandedItems(prev => ({ ...prev, [item.name]: !prev[item.name] }));
            } else {
              handleNavigate(item.route);
            }
          }}
        />
        {item.subItems && isExpanded && (
          <View style={styles.subMenuContainer}>
            {item.subItems.map((sub, index) => {
              const isLast = index === item.subItems.length - 1;
              return (
                <TouchableOpacity 
                  key={sub.name} 
                  style={styles.subMenuItem} 
                  onPress={() => handleNavigate(sub.route)}
                >
                  {/* The horizontal branch extending from the left border */}
                  <View style={styles.treeBranch} />
                  {/* The tiny circle at the end of the branch */}
                  <View style={styles.treeNode} />
                  <Text style={[styles.subMenuLabel, getIsActive(sub.route) && { color: AMBER }]}>
                    {sub.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {/* White overlay to mask the bottom tail of the border if needed */}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.drawerContainer}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.gridButton} activeOpacity={0.7}>
          <Feather name="grid" size={20} color={AMBER} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.menuSection}>
          {MENU_ITEMS.map(renderMenuItem)}
        </View>

        <View style={styles.divider} />

        <View style={styles.menuSection}>
          {BOTTOM_MENU_ITEMS.map(renderMenuItem)}
        </View>
      </ScrollView>
    </View>
  );
}

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          width: 300,
          backgroundColor: DRAWER_BG,
        },
        drawerType: 'front',
        swipeEnabled: true,
        swipeEdgeWidth: 80,
      }}
    >
      <Drawer.Screen name="MainTabs" component={MainTabs} />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: DRAWER_BG,
  },

  // Header
  header: {
    paddingTop: 56,
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    backgroundColor: AMBER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkText: {
    color: '#0F172A',
    fontWeight: '800',
  },
  brandName: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandNameCrm: {
    color: AMBER,
  },
  logoSubtext: {
    color: ITEM_INACTIVE,
    fontSize: 11,
    marginTop: 1,
  },
  gridButton: {
    padding: 8,
  },

  // Menu
  scrollView: {
    flex: 1,
  },
  menuSection: {
    paddingVertical: 10,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  drawerItemActive: {
    backgroundColor: ITEM_ACTIVE_BG,
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: AMBER,
  },
  drawerItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  drawerItemIcon: {
    width: 20,
  },
  drawerItemLabel: {
    flex: 1,
    fontSize: 15,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  drawerItemLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  
  // Sub-menu tree styles
  subMenuContainer: {
    marginLeft: 33, // Aligns perfectly with the center of the 18px icon which has 24px left padding
    borderLeftWidth: 1,
    borderColor: '#334155', // Slate 700
    paddingTop: 4,
    paddingBottom: 8,
  },
  subMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  treeBranch: {
    width: 12,
    height: 1,
    backgroundColor: '#334155',
  },
  treeNode: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#64748B', // Slate 500
    marginLeft: -2,
    marginRight: 10,
  },
  subMenuLabel: {
    color: '#94A3B8', // Slate 400
    fontSize: 13,
    fontWeight: '500',
  },
  
  divider: {
    height: 1,
    backgroundColor: DIVIDER,
  },

  // Footer
  footer: {
    padding: 16,
    paddingBottom: 34,
  },
  footerBanner: {
    backgroundColor: '#1E1B4B',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#312E81',
    gap: 4,
  },
  footerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  footerLine: {
    color: ITEM_INACTIVE,
    fontSize: 12,
  },
});
