import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * The channel partner portal on the phone — all a partner account can use:
 * submit a lead, follow the leads they brought, see their commission.
 */
export default function PartnerScreen() {
  const { colors } = useTheme();
  const { logout } = useAuth();
  const [me, setMe] = useState(null);
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState({ name: '', mobile: '', email: '', project: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([api.get('/partner/me'), api.get('/partner/leads')]);
      setMe(m.data); setLeads(l.data);
    } catch (e) { Alert.alert('Partner portal', e?.response?.data?.message || e.message); } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name.trim() || !form.mobile.trim()) { Alert.alert('Submit a lead', 'Name and mobile are required.'); return; }
    setBusy(true);
    try {
      const r = await api.post('/partner/leads', form);
      Alert.alert('Thank you', r.data.message);
      setForm({ name: '', mobile: '', email: '', project: '', notes: '' });
      load();
    } catch (e) { Alert.alert('Submit a lead', e?.response?.data?.message || e.message); } finally { setBusy(false); }
  };

  const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    pad: { padding: spacing.screenH, paddingTop: 56 },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    h1: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    muted: { color: colors.text.muted, fontSize: typography.size.sm },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: spacing.md },
    stat: { width: '48%', backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 10 },
    statValue: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginTop: 2 },
    title: { color: colors.brand.light, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, marginVertical: 8 },
    card: { backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: spacing.md, gap: 8 },
    input: { borderWidth: 1, borderColor: colors.border.default, borderRadius: spacing.radius.md, padding: 10, color: colors.text.primary, backgroundColor: colors.bg.tertiary },
    btn: { backgroundColor: colors.brand.primary, borderRadius: spacing.radius.md, padding: 12, alignItems: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    text: { color: colors.text.primary, fontSize: typography.size.sm },
  });

  return (
    <ScrollView style={s.root} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand.primary} />}>
      <View style={s.head}>
        <View>
          <Text style={s.h1}>Partner portal</Text>
          <Text style={s.muted}>{me?.partner?.companyName || ''}</Text>
        </View>
        <TouchableOpacity onPress={logout}><Text style={{ color: colors.text.link }}>Sign out</Text></TouchableOpacity>
      </View>

      <View style={s.stats}>
        <View style={s.stat}><Text style={s.muted}>Leads submitted</Text><Text style={s.statValue}>{me?.leads ?? '—'}</Text></View>
        <View style={s.stat}><Text style={s.muted}>Commission earned</Text><Text style={s.statValue}>{inr(me?.commission?.total)}</Text></View>
        <View style={s.stat}><Text style={s.muted}>Approved</Text><Text style={s.statValue}>{inr(me?.commission?.approved)}</Text></View>
        <View style={s.stat}><Text style={s.muted}>Paid to you</Text><Text style={[s.statValue, { color: '#34D399' }]}>{inr(me?.commission?.paid)}</Text></View>
      </View>

      <Text style={s.title}>Submit a lead</Text>
      <View style={s.card}>
        {[['name', 'Customer name *', 'default'], ['mobile', 'Mobile *', 'phone-pad'], ['email', 'Email', 'email-address'], ['project', 'Project interested in', 'default'], ['notes', 'Notes', 'default']].map(([k, ph, kb]) => (
          <TextInput key={k} style={s.input} value={form[k]} onChangeText={(v) => setForm((f) => ({ ...f, [k]: v }))} placeholder={ph} placeholderTextColor={colors.text.muted} keyboardType={kb} autoCapitalize={k === 'email' ? 'none' : 'sentences'} />
        ))}
        <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Submit lead</Text>}
        </TouchableOpacity>
      </View>

      <Text style={s.title}>My leads</Text>
      <View style={s.card}>
        {leads.length === 0 && <Text style={s.muted}>No leads yet.</Text>}
        {leads.map((l) => (
          <View key={l.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.text}>{l.name}</Text>
              <Text style={s.muted}>{l.project || '—'} · {l.mobile}</Text>
            </View>
            <Text style={s.text}>{l.status}</Text>
          </View>
        ))}
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
