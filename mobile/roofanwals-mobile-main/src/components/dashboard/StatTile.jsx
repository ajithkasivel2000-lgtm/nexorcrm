import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Polyline, Polygon, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const nf = new Intl.NumberFormat('en-IN');

/** Tiny area sparkline — the shape beside the number. */
export function Sparkline({ series = [], color, width = 120, height = 30 }) {
  const points = series.length ? series : [0];
  const max = Math.max(...points, 1);
  const w = 100;
  const h = 28;
  const step = points.length > 1 ? w / (points.length - 1) : w;

  const line = points.map((v, i) => `${i * step},${h - (v / max) * (h - 3) - 1.5}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  const id = `sp${String(color).replace('#', '')}`;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Polygon points={area} fill={`url(#${id})`} />
      <Polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Headline figure: the number, what it counts, how it moved, and its shape.
 * The change carries an arrow and a sign, so direction is never colour-alone.
 */
export default function StatTile({ icon, label, value, spark, color = '#3987E5', onPress }) {
  const { colors } = useTheme();

  const change = spark?.change;
  const hasChange = change !== null && change !== undefined;
  const up = hasChange && change > 0;
  const flat = hasChange && change === 0;

  const themed = StyleSheet.create({
    card: {
      flex: 1,
      minWidth: '46%',
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: spacing.sm + 2,
    },
    label: { flex: 1, color: colors.text.secondary, fontSize: typography.size.xs, fontWeight: '600' },
    value: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    sub:   { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 4 },
  });

  const Body = (
    <>
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
          <Feather name={icon} size={14} color={color} />
        </View>
        <Text style={themed.label} numberOfLines={1}>{label}</Text>
      </View>

      <View style={styles.figureRow}>
        <Text style={themed.value}>
          {typeof value === 'number' ? nf.format(value) : (value ?? '—')}
        </Text>
        {hasChange ? (
          <View style={styles.change}>
            <Feather
              name={up ? 'arrow-up-right' : flat ? 'minus' : 'arrow-down-right'}
              size={11}
              color={up ? '#34D399' : flat ? colors.text.muted : '#F87171'}
            />
            <Text style={[styles.changeText, { color: up ? '#34D399' : flat ? colors.text.muted : '#F87171' }]}>
              {up ? '+' : ''}{change}%
            </Text>
          </View>
        ) : null}
      </View>

      <Sparkline series={spark?.series} color={color} width="100%" height={30} />
      <Text style={themed.sub}>
        {spark?.thisMonth > 0 ? `+${spark.thisMonth} this month` : 'none this month'}
      </Text>
    </>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={themed.card}>{Body}</TouchableOpacity>;
  }
  return <View style={themed.card}>{Body}</View>;
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeText: {
    fontSize: typography.size.xs,
    fontWeight: '600',
  },
});
