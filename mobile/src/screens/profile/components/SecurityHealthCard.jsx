import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

export default function SecurityHealthCard({ securityScore }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  if (!securityScore) return null;

  const { score, checks } = securityScore;

  // Simple ring logic for react-native without SVG
  // 50 means half full, etc. Since no easy SVG, we just show a large number with border.
  const scoreColor = score >= 80 ? '#22C55E' : score >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="shield" size={16} color="#4F46E5" />
        <Text style={styles.title}>Security Health</Text>
      </View>
      
      <View style={styles.content}>
        <View style={[styles.scoreRing, { borderColor: scoreColor }]}>
          <Text style={styles.scoreText}>{score}</Text>
        </View>
        
        <View style={styles.checks}>
          {checks.map(check => {
            const isPass = check.pass === true;
            const isFail = check.pass === false;
            const isNotTracked = check.pass === null;

            return (
              <View key={check.key} style={styles.checkRow}>
                {isPass && <Feather name="check" size={14} color="#22C55E" />}
                {isFail && <Feather name="alert-triangle" size={14} color="#F59E0B" />}
                {isNotTracked && <Feather name="minus" size={14} color="#94A3B8" />}
                <Text style={[styles.checkText, isFail && styles.checkFailText]}>
                  {check.label} {isNotTracked && '(not tracked)'}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.bg.secondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: '#F8FAFC',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 20,
  },
  scoreRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  checks: {
    flex: 1,
    gap: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  checkFailText: {
    color: '#92400E',
  }
});
