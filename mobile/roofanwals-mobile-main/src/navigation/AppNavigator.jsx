import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LoginScreen             from '../screens/auth/LoginScreen';
import DrawerNavigator         from './DrawerNavigator';
import LeadDetailScreen        from '../screens/leads/LeadDetailScreen';
import OpportunityDetailScreen from '../screens/opportunities/OpportunityDetailScreen';
import ProjectDetailScreen     from '../screens/projects/ProjectDetailScreen';
import CreateChannelPartnerScreen from '../screens/channelPartners/CreateChannelPartnerScreen';
import EditChannelPartnerScreen   from '../screens/channelPartners/EditChannelPartnerScreen';

const Stack = createNativeStackNavigator();

// Defensive fonts fallback — React Navigation v7 requires theme.fonts.
const FALLBACK_FONTS = {
  regular: { fontFamily: 'System', fontWeight: '400' },
  medium:  { fontFamily: 'System', fontWeight: '500' },
  bold:    { fontFamily: 'System', fontWeight: '700' },
  heavy:   { fontFamily: 'System', fontWeight: '900' },
};

export default function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const { colors, mode } = useTheme();

  const navTheme = {
    ...(mode === 'light' ? DefaultTheme : DarkTheme),
    fonts: (mode === 'light' ? DefaultTheme : DarkTheme).fonts ?? DefaultTheme.fonts ?? FALLBACK_FONTS,
    colors: {
      ...(mode === 'light' ? DefaultTheme.colors : DarkTheme.colors),
      primary:      colors.brand.primary,
      background:   colors.bg.primary,
      card:         colors.bg.secondary,
      text:         colors.text.primary,
      border:       colors.border.default,
      notification: colors.accent.red,
    },
  };

  const SCREEN_OPTIONS = {
    headerStyle:            { backgroundColor: colors.bg.secondary },
    headerTintColor:        colors.text.primary,
    headerTitleStyle:       { fontWeight: '600', color: colors.text.primary },
    headerBackTitleVisible: false,
    animation:              'slide_from_right',
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main"              component={DrawerNavigator}         options={{ headerShown: false }} />
            <Stack.Screen name="LeadDetail"        component={LeadDetailScreen}        options={{ title: 'Lead' }} />
            <Stack.Screen name="OpportunityDetail" component={OpportunityDetailScreen} options={{ title: 'Opportunity' }} />
            <Stack.Screen name="ProjectDetail"     component={ProjectDetailScreen}     options={{ title: 'Project' }} />
            <Stack.Screen name="CreateChannelPartner" component={CreateChannelPartnerScreen} options={{ title: 'New Channel Partner' }} />
            <Stack.Screen name="EditChannelPartner"   component={EditChannelPartnerScreen}   options={{ title: 'Edit Channel Partner' }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
