import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

export default function SearchBar({ value, onChangeText, placeholder = 'Search...', onClear }) {
  const { colors } = useTheme();

  const themed = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.tertiary,
      borderRadius: spacing.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      height: 46,
    },
    input: { flex: 1, color: colors.text.primary, fontSize: typography.size.base, height: '100%' },
    clearText: { color: colors.text.muted, fontSize: 14 },
  });

  return (
    <View style={themed.container}>
      <View style={{ marginRight: spacing.sm }}>
        <Feather name="search" size={16} color={colors.text.muted} />
      </View>
      <TextInput
        style={themed.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value ? (
        <TouchableOpacity onPress={onClear || (() => onChangeText(''))} style={styles.clearBtn}>
          <Text style={themed.clearText}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clearBtn: { padding: 4 },
});
