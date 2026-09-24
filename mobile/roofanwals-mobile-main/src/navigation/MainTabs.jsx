import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

// Screens
import DashboardScreen      from '../screens/dashboard/DashboardScreen';
import LeadsScreen          from '../screens/leads/LeadsScreen';
import OpportunitiesScreen  from '../screens/opportunities/OpportunitiesScreen';
import ProjectsScreen       from '../screens/projects/ProjectsScreen';
import ProfileScreen        from '../screens/profile/ProfileScreen';

// Other screens (hidden from tab bar)
import CampaignLeadsScreen from '../screens/leads/CampaignLeadsScreen';
import ImportLeadsScreen from '../screens/leads/ImportLeadsScreen';
import CustomersScreen from '../screens/customers/CustomersScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import TeamChatScreen from '../screens/chat/TeamChatScreen';
import AssistantScreen from '../screens/assistant/AssistantScreen';
import ChannelPartnersScreen from '../screens/channelPartners/ChannelPartnersScreen';
import RRQScreen from '../screens/rrq/RRQScreen';
import BookingsScreen from '../screens/bookings/BookingsScreen';

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

import ProjectStatusListScreen from '../screens/settings/lookups/ProjectStatusListScreen';
import ProjectTypeListScreen from '../screens/settings/lookups/ProjectTypeListScreen';
import LeadStatusListScreen from '../screens/settings/lookups/LeadStatusListScreen';
import LeadTypeListScreen from '../screens/settings/lookups/LeadTypeListScreen';
import PrimarySourceListScreen from '../screens/settings/lookups/PrimarySourceListScreen';
import SecondarySourceListScreen from '../screens/settings/lookups/SecondarySourceListScreen';
import TertiarySourceListScreen from '../screens/settings/lookups/TertiarySourceListScreen';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Dashboard:     'home',
  Leads:         'filter',
  Opportunities: 'briefcase',
  Projects:      'layout',
  Profile:       'user',
};

function TabIcon({ name, focused, color }) {
  return (
    <View style={[styles.iconWrap, focused && { backgroundColor: color + '22' }]}>
      <Feather name={TAB_ICONS[name] || 'circle'} size={18} color={color} />
    </View>
  );
}

export default function MainTabs() {
  const { colors } = useTheme();
  /* Edge-to-edge draws the app under the system navigation, so a fixed height
     puts the labels behind the nav bar on 3-button devices. Growing by the
     bottom inset covers 3-button, gesture and no-nav layouts alike. */
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  /* Five tabs share the width, so the longest label ("Opportunities") is what
     decides whether text fits. Shrink it a step on narrow handsets. */
  const { width } = useWindowDimensions();
  const labelSize = width < 360 ? 9 : width < 400 ? 10 : typography.size.xs;

  const themed = StyleSheet.create({
    tabBar: {
      backgroundColor: colors.bg.secondary,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      height: 62 + bottomPad,
      paddingBottom: bottomPad,
      paddingTop: 6,
      elevation: 20,
    },
  });

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => <TabIcon name={route.name} focused={focused} color={color} />,
        tabBarLabel: ({ focused, children }) => (
          <Text numberOfLines={1} style={[styles.tabLabel, { fontSize: labelSize, color: colors.text.muted }, focused && { color: colors.brand.primary, fontWeight: typography.weight.semibold }]}>
            {children}
          </Text>
        ),
        tabBarStyle: themed.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarActiveTintColor:   colors.brand.primary,
        tabBarInactiveTintColor: colors.text.muted,
      })}
    >
      <Tab.Screen name="Dashboard"     component={DashboardScreen}     options={{ title: 'Home' }} />
      <Tab.Screen name="Leads"         component={LeadsScreen}         />
      <Tab.Screen name="Opportunities" component={OpportunitiesScreen} />
      <Tab.Screen name="Projects"      component={ProjectsScreen}      />
      <Tab.Screen name="Profile"       component={ProfileScreen}       />

      {/* Hidden tabs (accessible via drawer, but keeps the tab bar visible) */}
      <Tab.Screen name="CampaignLeads" component={CampaignLeadsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="ImportLeads" component={ImportLeadsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="Customers" component={CustomersScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="Reports" component={ReportsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="ChannelPartners" component={ChannelPartnersScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="TeamChat" component={TeamChatScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="Assistant" component={AssistantScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="RRQ" component={RRQScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="Bookings" component={BookingsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      
      <Tab.Screen name="SettingsUserAdmin" component={UserAdminScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsUserGroups" component={UserGroupsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsLeadAssignment" component={LeadAssignmentScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsReminders" component={RemindersScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsMail" component={MailSettingsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsEmailTemplates" component={EmailTemplatesScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsRegistration" component={RegistrationSettingsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsSession" component={SessionSettingsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsUser" component={UserSettingsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsSecurity" component={SecuritySettingsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="SettingsLogs" component={LogsScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      <Tab.Screen name="LookupProjectStatus" component={ProjectStatusListScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="LookupProjectType" component={ProjectTypeListScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="LookupLeadStatus" component={LeadStatusListScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="LookupLeadType" component={LeadTypeListScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="LookupPrimarySource" component={PrimarySourceListScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="LookupSecondarySource" component={SecondarySourceListScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="LookupTertiarySource" component={TertiarySourceListScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    gap: 2,
  },
  iconWrap: {
    width: 40,
    height: 30,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
});
