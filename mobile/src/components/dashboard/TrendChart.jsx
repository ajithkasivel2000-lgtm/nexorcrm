import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';

const CHART_H = 160;
const MAX_Y = 4; // rounded axis like the web chart (0–4)

/**
 * 12-month leads vs opportunities area/line chart with grid, axis labels
 * and month ticks — the mobile twin of the web "Leads and opportunities" chart.
 */
export default function TrendChart({ trend = [] }) {
  const { colors } = useTheme();

  if (!trend.length) return null;

  const w = 340;
  const padL = 24;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = CHART_H - padT - padB;

  const x = (i) => padL + (trend.length > 1 ? (i / (trend.length - 1)) * innerW : innerW / 2);
  const y = (v) => padT + innerH - (Math.min(v, MAX_Y) / MAX_Y) * innerH;

  const buildPath = (key) => trend.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d[key])}`).join(' ');
  const leadsPath = buildPath('leads');
  const oppsPath = buildPath('opportunities');
  const areaPath = `${leadsPath} L${x(trend.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const axisVals = [0, 1, 2, 3, 4];

  const themed = StyleSheet.create({
    axisText: { color: colors.text.muted, fontSize: 9, minWidth: 14, textAlign: 'center' },
    legendText: { color: colors.text.secondary, fontSize: typography.size.xs },
  });

  return (
    <View>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${w} ${CHART_H}`}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#14B8A6" stopOpacity="0.25" />
            <Stop offset="1" stopColor="#14B8A6" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* horizontal grid */}
        {axisVals.map((v) => (
          <Line key={v} x1={padL} y1={y(v)} x2={w - padR} y2={y(v)} stroke={colors.border.default} strokeWidth="1" />
        ))}

        {/* leads area + line */}
        <Path d={areaPath} fill="url(#trendFill)" />
        <Path d={leadsPath} fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" />
        <Path d={oppsPath} fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />

        {/* dots */}
        {trend.map((d, i) => (
          <Circle key={`${d.month}-${i}`} cx={x(i)} cy={y(d.leads)} r="2.5" fill="#2DD4BF" />
        ))}
      </Svg>

      {/* y-axis labels */}
      <View style={styles.yLabels} pointerEvents="none">
        {axisVals.slice().reverse().map((v) => (
          <Text key={v} style={themed.axisText}>{v}</Text>
        ))}
      </View>

      {/* x-axis labels */}
      <View style={styles.xLabels}>
        {trend.map((d, i) => (
          <Text key={`${d.month}-lbl-${i}`} style={[themed.axisText, i % 2 !== 0 && { opacity: 0 }]}>
            {d.month}
          </Text>
        ))}
      </View>

      {/* legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#2DD4BF' }]} />
          <Text style={themed.legendText}>Leads</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#818CF8' }]} />
          <Text style={themed.legendText}>Opportunities</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabels: {
    position: 'absolute',
    left: 0,
    top: 4,
    bottom: 26,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 6,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
