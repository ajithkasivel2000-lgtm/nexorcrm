import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, RefreshControl, Linking,
} from 'react-native';
import { leadsService } from '../../services/leads';
import LoadingSpinner from '../../components/LoadingSpinner';
import { WhatsAppPanel, CallsPanel, DocumentsPanel } from '../../components/LeadComms';
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

function Section({ title, titleStyle, cardStyle, children }) {
  return (
    <View style={styles.section}>
      <Text style={titleStyle}>{title}</Text>
      <View style={cardStyle}>{children}</View>
    </View>
  );
}

const STATUS_COLORS = {
  New: '#38BDF8', Open: '#60A5FA', Qualified: '#34D399',
  Won: '#10B981', Lost: '#F87171',
};

export default function LeadDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { id, name } = route.params;
  const [lead, setLead]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await leadsService.getLead(id);
      setLead(res?.lead || res?.data || res);
    } catch (e) {
      console.error('LeadDetail error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({ title: name || 'Lead Detail' });
    load();
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!lead)   return (
    <View style={styles.root}>
      <Text style={styles.errorText}>Could not load lead.</Text>
    </View>
  );

  const status   = lead.status || lead.leadStatus || 'New';
  const badgeColor = STATUS_COLORS[status] || '#94A3B8';

  const themed = StyleSheet.create({
    root:          { flex: 1, backgroundColor: colors.bg.primary },
    errorText:     { color: colors.text.muted, textAlign: 'center', marginTop: 60 },
    heroInitials:  { color: colors.brand.light, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    heroName:      { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold, textAlign: 'center' },
    contactBtn: {
      flex: 1,
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      padding: spacing.md,
      gap: 4,
    },
    contactBtnText: { color: colors.text.secondary, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
    sectionTitle:   { color: colors.brand.light, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, marginBottom: 8 },
    sectionCard:    { backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: spacing.md, gap: 10 },
    infoLabel:      { color: colors.text.muted, fontSize: typography.size.sm, flex: 1 },
    infoValue:      { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: typography.weight.medium, flex: 1.5, textAlign: 'right' },
  });

  return (
    <View style={themed.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.primary} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroAvatar}>
            <Text style={themed.heroInitials}>
              {(lead.name || lead.fullName || 'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </Text>
          </View>
          <Text style={themed.heroName}>{lead.name || lead.fullName || 'Unknown'}</Text>
          <View style={[styles.heroBadge, { backgroundColor: badgeColor + '20', borderColor: badgeColor + '50' }]}>
            <Text style={[styles.heroBadgeText, { color: badgeColor }]}>{status}</Text>
          </View>
        </View>

        {/* Quick Contact Buttons */}
        {(lead.phone || lead.mobile) && (
          <View style={styles.contactRow}>
            <TouchableOpacity style={themed.contactBtn} onPress={() => Linking.openURL(`tel:${lead.phone || lead.mobile}`)}>
              <Text style={styles.contactBtnIcon}>📞</Text>
              <Text style={themed.contactBtnText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={themed.contactBtn} onPress={() => Linking.openURL(`sms:${lead.phone || lead.mobile}`)}>
              <Text style={styles.contactBtnIcon}>💬</Text>
              <Text style={themed.contactBtnText}>SMS</Text>
            </TouchableOpacity>
            {lead.email && (
              <TouchableOpacity style={themed.contactBtn} onPress={() => Linking.openURL(`mailto:${lead.email}`)}>
                <Text style={styles.contactBtnIcon}>✉️</Text>
                <Text style={themed.contactBtnText}>Email</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Basic Info */}
        <Section title="Basic Information" titleStyle={themed.sectionTitle} cardStyle={themed.sectionCard}>
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Phone"       value={lead.phone || lead.mobile} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Email"       value={lead.email} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Lead Type"   value={lead.leadType} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Status"      value={lead.status} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Assigned To" value={lead.ownerName || lead.owner} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Branch"      value={lead.branch?.name || lead.branchName} />
        </Section>

        {/* Source */}
        <Section title="Source" titleStyle={themed.sectionTitle} cardStyle={themed.sectionCard}>
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Primary Source"   value={lead.primarySource} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Secondary Source" value={lead.secondarySource} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Tertiary Source"  value={lead.tertiarySource} />
        </Section>

        {/* Property Interest */}
        <Section title="Property Interest" titleStyle={themed.sectionTitle} cardStyle={themed.sectionCard}>
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Project"      value={lead.projectName || lead.project} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Budget"       value={lead.budgetLimit} />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Notes"        value={lead.otherNotes} />
        </Section>

        {/* Dates */}
        <Section title="Timeline" titleStyle={themed.sectionTitle} cardStyle={themed.sectionCard}>
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Created"
            value={lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-IN') : null}
          />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Last Updated"
            value={lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString('en-IN') : null}
          />
          <InfoRow labelStyle={themed.infoLabel} valueStyle={themed.infoValue} label="Next Follow-up"
            value={lead.followUpDate ? new Date(lead.followUpDate).toLocaleString('en-IN') : null}
          />
        </Section>

        {/* Talking to the lead, and its files */}
        <WhatsAppPanel leadId={lead.id} mobile={lead.mobile} />
        <CallsPanel leadId={lead.id} />
        <DocumentsPanel entityType="lead" entityId={lead.id} />

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.screenH },

  hero: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
  heroAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(99,102,241,0.3)',
    borderWidth: 2, borderColor: 'rgba(99,102,241,0.6)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroBadge:      { paddingHorizontal: 14, paddingVertical: 4, borderRadius: spacing.radius.full, borderWidth: 1 },
  heroBadgeText:  { fontSize: typography.size.sm, fontWeight: typography.weight.semibold },

  contactRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  contactBtnIcon: { fontSize: 22 },

  section:       { marginBottom: spacing.md },

  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
});
