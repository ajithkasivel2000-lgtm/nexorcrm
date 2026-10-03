import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

/**
 * Hamburger button that opens the side drawer.
 * Place in any screen header — must be rendered inside the DrawerNavigator.
 */
export default function MenuButton({ onPress, size = 22 }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    btn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.bg.tertiary,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

  return (
    <TouchableOpacity
      style={themed.btn}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Feather name="menu" size={size} color={colors.text.primary} />
    </TouchableOpacity>
  );
}
