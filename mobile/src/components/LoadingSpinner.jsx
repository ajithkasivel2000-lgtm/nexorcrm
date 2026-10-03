import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function LoadingSpinner({ size = 'large', overlay = false }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999,
    },
    box: {
      backgroundColor: colors.bg.secondary,
      padding: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
  });

  if (overlay) {
    return (
      <View style={themed.overlay}>
        <View style={themed.box}>
          <ActivityIndicator size={size} color={colors.brand.primary} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.center}>
      <ActivityIndicator size={size} color={colors.brand.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
});
