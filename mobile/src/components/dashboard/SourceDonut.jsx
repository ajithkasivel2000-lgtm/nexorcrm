import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';

const SIZE = 150;
const R = 52;
const CX = SIZE / 2;
const CY = SIZE / 2;

const PALETTE = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767'];

/** Donut showing leads by primary source, total in the middle. */
export default function SourceDonut({ data = [], centerLabel = 'leads' }) {
  const { colors } = useTheme();
  const total = data.reduce((s, d) => s + d.value, 0);

  if (!total) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.text.muted }]}>No lead sources yet</Text>
      </View>
    );
  }

  // build arcs
  let angle = -90;
  const arcs = data.slice(0, 8).map((d, i) => {
    const frac = d.value / total;
    const sweep = frac * 360;
    const start = angle;
    const end = angle + sweep - (data.slice(0, 8).length > 1 ? 1.5 : 0);
    angle += sweep;

    const rad = (deg) => (deg * Math.PI) / 180;
    const x1 = CX + R * Math.cos(rad(start));
    const y1 = CY + R * Math.sin(rad(start));
    const x2 = CX + R * Math.cos(rad(end));
    const y2 = CY + R * Math.sin(rad(end));
    const large = sweep > 180 ? 1 : 0;

    return {
      ...d,
      color: PALETTE[i % PALETTE.length],
      pct: Math.round(frac * 100),
      d: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`,
    };
  });

  const themed = StyleSheet.create({
    centerValue: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    centerLabel: { color: colors.text.muted, fontSize: typography.size.xs },
    legendName:  { flex: 1, color: colors.text.secondary, fontSize: typography.size.xs },
    legendValue: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600' },
  });

  return (
    <View style={styles.wrap}>
      <View>
        <Svg width={SIZE} height={SIZE}>
          {arcs.map((a, i) => (
            <Path key={i} d={a.d} fill={a.color} />
          ))}
        </Svg>
        {/* center total */}
        <View style={styles.center} pointerEvents="none">
          <Text style={themed.centerValue}>{total}</Text>
          <Text style={themed.centerLabel}>{centerLabel}</Text>
        </View>
      </View>

      {/* legend */}
      <View style={styles.legend}>
        {arcs.map((a, i) => (
          <View key={i} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: a.color }]} />
            <Text style={themed.legendName} numberOfLines={1}>{a.name}</Text>
            <Text style={themed.legendValue}>{a.value} · {a.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: SIZE,
  },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: typography.size.sm },
  legend: { alignSelf: 'stretch', marginTop: 12, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
