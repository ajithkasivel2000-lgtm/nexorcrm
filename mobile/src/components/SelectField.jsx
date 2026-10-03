import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

/**
 * A select field whose options drop down immediately below the field —
 * like a native <select>, not a bottom sheet.
 *
 * The open menu is absolutely positioned right under the field inside a
 * full-screen dismiss layer, so it floats above the rest of the form and
 * closes on any outside tap.
 */
export default function SelectField({ label, value, options = [], onSelect, placeholder = 'Loading…', disabled = false }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(90);

  const themed = StyleSheet.create({
    wrap: { marginBottom: spacing.md },
    label: { color: colors.text.secondary, fontSize: typography.size.xs, fontWeight: '600', marginBottom: 6 },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: open ? colors.brand.primary : colors.border.default,
      borderRadius: 8,
      backgroundColor: colors.bg.tertiary,
      paddingHorizontal: 12,
      height: 44,
      opacity: disabled ? 0.6 : 1,
    },
    value: { color: colors.text.primary, fontSize: typography.size.sm, flex: 1 },
    valueMuted: { color: colors.text.muted },
    menu: {
      position: 'absolute',
      top: menuTop,
      left: 0,
      right: 0,
      backgroundColor: colors.bg.secondary,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
      maxHeight: 220,
      elevation: 12,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      overflow: 'hidden',
      zIndex: 30,
    },
    optRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    optText: { color: colors.text.primary, fontSize: typography.size.sm, flex: 1 },
    optActive: { color: colors.brand.primary, fontWeight: '600' },
  });

  return (
    <View
      style={themed.wrap}
      onLayout={(e) => setMenuTop(e.nativeEvent.layout.height + 2)}
    >
      {label ? <Text style={themed.label}>{label}</Text> : null}

      <TouchableOpacity
        style={themed.field}
        onPress={() => !disabled && setOpen((v) => !v)}
        activeOpacity={0.75}
      >
        <Text style={[themed.value, !value && themed.valueMuted]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Feather
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.text.muted}
        />
      </TouchableOpacity>

      {open ? (
        <View style={StyleSheet.absoluteFill} zIndex={20}>
          {/* invisible full-screen tap-catcher */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={themed.menu} pointerEvents="auto">
            <ScrollView nestedScrollEnabled>
              {options.map((opt) => {
                const val = typeof opt === 'string' ? opt : opt.value;
                const lab = typeof opt === 'string' ? opt : (opt.label ?? opt.value);
                const active = val === value;
                return (
                  <TouchableOpacity
                    key={String(val)}
                    style={themed.optRow}
                    onPress={() => { onSelect(val); setOpen(false); }}
                  >
                    <Text style={[themed.optText, active && themed.optActive]} numberOfLines={1}>{lab}</Text>
                    {active ? <Feather name="check" size={15} color={colors.brand.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
