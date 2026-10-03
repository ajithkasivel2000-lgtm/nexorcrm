import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, RefreshControl } from 'react-native';
import { opportunitiesService } from '../../services/opportunities';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

function InfoRow({ label, value, labelStyle, valueStyle }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{value}</Text>
    </View>
  );
}

const STAGE_COLORS = {
  Prospecting: '#6366F1', Qualification: '#8B5CF6', Proposal: '#F59E0B',
  Negotiation: '#F97316', 'Closed Won': '#10B981', 'Closed Lost': '#EF4444',
};

function formatCurrency(val) {
  if (!val) return '—';
  const n = Number(val);
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`;
  return `₹${n.toLocaleString()}`;
}

export default function OpportunityDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { id, name } = route.params;
  const [opp, setOpp]           = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await opportunitiesService.getOpportunity(id);
      setOpp(res?.opportunity || res?.data || res);
    } catch (e) { console.error(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { navigation.setOptions({ title: name || 'Opportunity' }); load(); }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!opp) return <View style={[styles.root, { backgroundColor: colors.bg.primary }]}><Text style={[styles.err, { color: colors.text.muted }]}>Could not load opportunity.</Text></View>;

  const stage = opp.stage || opp.currentStage || 'Prospecting';
  const color = STAGE_COLORS[stage] || colors.brand.primary;

  const themed = StyleSheet.create({
    root:    { flex: 1, backgroundColor: colors.bg.primary },
    heroName:  { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold, textAlign: 'center' },
    heroValue: { color, fontSize: typography.size['3xl'], fontWeight: typography.weight.extrabold },
    card: { backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: spacing.md, gap: 10 },
    infoLabel: { color: colors.text.muted, fontSize: typography.size.sm, flex: 1 },
    infoValue: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: typography.weight.medium, flex: 1.5, textAlign: 'right' },
  });

  return (
    <View style={themed.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.primary} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.stageIcon, { backgroundColor: color + '20', borderColor: color + '50' }]}>
            <Text style={{ fontSize: 32 }}>💼</Text>
          </View>
          <Text style={themed.heroName}>{opp.name || opp.title || 'Untitled'}</Text>
          <View style={[styles.stageBadge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
            <Text style={[styles.stageText, { color }]}>{stage}</Text>
          </View>
          <Text style={themed.heroValue}>{formatCurrency(opp.value || opp.dealValue)}</Text>
        </View>

        <View style={themed.card}>
          <InfoRow label="Contact"           value={opp.contactName || opp.contact?.name} labelStyle={themed.infoLabel} valueStyle={themed.infoValue} />
          <InfoRow label="Assigned To"       value={opp.assignedTo?.name || opp.assignedToName} labelStyle={themed.infoLabel} valueStyle={themed.infoValue} />
          <InfoRow label="Expected Close"    value={opp.closeDate ? new Date(opp.closeDate).toLocaleDateString('en-IN') : null} labelStyle={themed.infoLabel} valueStyle={themed.infoValue} />
          <InfoRow label="Probability"       value={opp.probability ? `${opp.probability}%` : null} labelStyle={themed.infoLabel} valueStyle={themed.infoValue} />
          <InfoRow label="Project"           value={opp.project?.name || opp.projectName} labelStyle={themed.infoLabel} valueStyle={themed.infoValue} />
          <InfoRow label="Source"            value={opp.primarySource} labelStyle={themed.infoLabel} valueStyle={themed.infoValue} />
          <InfoRow label="Description"       value={opp.description} labelStyle={themed.infoLabel} valueStyle={themed.infoValue} />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screenH },

  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  stageIcon: { width: 72, height: 72, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stageBadge: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: spacing.radius.full, borderWidth: 1 },
  stageText:  { fontSize: typography.size.sm, fontWeight: typography.weight.semibold },

  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  err:     { textAlign: 'center', marginTop: 60 },
});
