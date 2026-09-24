import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { bookingsService, inr, shortDate } from '../../services/bookings';
import { DocumentsPanel } from '../../components/LeadComms';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const MODES = ['NEFT', 'UPI', 'Cheque', 'Cash', 'Home Loan'];

/** One booking: the plan, what is paid and overdue, and recording a payment. */
export default function BookingDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { id, name } = route.params;
  const [b, setB] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('NEFT');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => bookingsService.get(id).then(setB).catch((e) => Alert.alert('Booking', e?.response?.data?.message || e.message)).finally(() => setRefreshing(false)), [id]);
  useEffect(() => { navigation.setOptions({ title: name || 'Booking' }); load(); }, [id]);

  const record = async () => {
    const n = Number(amount);
    if (!(n > 0)) { Alert.alert('Payment', 'Enter the amount received.'); return; }
    setBusy(true);
    try {
      const updated = await bookingsService.addPayment(id, { amount: n, mode, reference });
      setB((prev) => ({ ...prev, ...updated }));
      setAmount(''); setReference('');
      Alert.alert('Payment recorded', `${inr(n)} received.`);
    } catch (e) {
      Alert.alert('Payment', e?.response?.data?.message || e.message);
    } finally { setBusy(false); }
  };

  const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    pad: { padding: spacing.screenH },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
    stat: { width: '48%', backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 10 },
    statLabel: { color: colors.text.muted, fontSize: 11 },
    statValue: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginTop: 2 },
    title: { color: colors.brand.light, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, marginBottom: 8, marginTop: spacing.md },
    card: { backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: spacing.md, gap: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    text: { color: colors.text.primary, fontSize: typography.size.sm },
    muted: { color: colors.text.muted, fontSize: typography.size.sm },
    input: { borderWidth: 1, borderColor: colors.border.default, borderRadius: spacing.radius.md, padding: 10, color: colors.text.primary, backgroundColor: colors.bg.tertiary },
    chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: spacing.radius.full, borderWidth: 1, borderColor: colors.border.default },
    chipOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
    btn: { backgroundColor: colors.brand.primary, borderRadius: spacing.radius.md, padding: 12, alignItems: 'center' },
  });

  if (!b) return <View style={s.root}><ActivityIndicator style={{ marginTop: 40 }} color={colors.brand.primary} /></View>;
  const sum = b.summary;
  const open = b.status !== 'Cancelled' && sum.balance > 0;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand.primary} />}>
      <Text style={s.muted}>{b.project?.projectName} · Unit {b.unit?.unitNumber} · {b.status} · booked {shortDate(b.bookingDate)}</Text>
      <View style={[s.stats, { marginTop: spacing.md }]}>
        <View style={s.stat}><Text style={s.statLabel}>Agreement value</Text><Text style={s.statValue}>{inr(sum.agreementValue)}</Text></View>
        <View style={s.stat}><Text style={s.statLabel}>Received ({sum.percentPaid}%)</Text><Text style={[s.statValue, { color: '#34D399' }]}>{inr(sum.paid)}</Text></View>
        <View style={s.stat}><Text style={s.statLabel}>Balance</Text><Text style={s.statValue}>{inr(sum.balance)}</Text></View>
        <View style={s.stat}><Text style={s.statLabel}>Overdue</Text><Text style={[s.statValue, sum.overdue > 0 && { color: '#F87171' }]}>{inr(sum.overdue)}</Text></View>
      </View>

      <Text style={s.title}>Payment plan</Text>
      <View style={s.card}>
        {sum.milestones.map((m) => (
          <View key={m.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.text}>{m.name}</Text>
              <Text style={s.muted}>{m.dueDate ? `due ${shortDate(m.dueDate)}` : 'no due date'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.text}>{inr(m.amount)}</Text>
              <Text style={{ color: m.outstanding <= 0 ? '#34D399' : m.overdue ? '#F87171' : colors.text.muted, fontSize: 12 }}>
                {m.outstanding <= 0 ? 'Paid' : m.overdue ? `Overdue ${inr(m.outstanding)}` : `Due ${inr(m.outstanding)}`}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={s.title}>Payments received</Text>
      <View style={s.card}>
        {b.payments.length === 0 && <Text style={s.muted}>No payments yet.</Text>}
        {b.payments.map((p) => (
          <View key={p.id} style={s.row}>
            <Text style={s.text}>{shortDate(p.paidOn)} · {p.mode || '—'}</Text>
            <Text style={s.text}>{inr(p.amount)}</Text>
          </View>
        ))}
      </View>

      {open && (
        <>
          <Text style={s.title}>Record a payment</Text>
          <View style={s.card}>
            <TextInput style={s.input} value={amount} onChangeText={setAmount} placeholder={`Amount (balance ${inr(sum.balance)})`} placeholderTextColor={colors.text.muted} keyboardType="numeric" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {MODES.map((m) => (
                <TouchableOpacity key={m} style={[s.chip, mode === m && s.chipOn]} onPress={() => setMode(m)}>
                  <Text style={{ color: mode === m ? '#fff' : colors.text.secondary }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={s.input} value={reference} onChangeText={setReference} placeholder="Reference (UTR / cheque no.)" placeholderTextColor={colors.text.muted} />
            <TouchableOpacity style={s.btn} onPress={record} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Record payment</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}

      {b.leadId ? <View style={{ marginTop: spacing.md }}><DocumentsPanel entityType="lead" entityId={b.leadId} /></View> : null}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
