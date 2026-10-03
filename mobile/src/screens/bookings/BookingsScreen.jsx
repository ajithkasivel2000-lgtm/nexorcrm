import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput, ActivityIndicator,
} from 'react-native';
import { bookingsService, inr, shortDate } from '../../services/bookings';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const STATUS_COLOR = { Booked: '#60A5FA', Agreement: '#A78BFA', Registered: '#34D399', Cancelled: '#F87171' };

/** Bookings & payments: every unit sold, what has been received, what is overdue. */
export default function BookingsScreen({ navigation }) {
  const { colors } = useTheme();
  const [rows, setRows] = useState(null);
  const [collections, setCollections] = useState(null);
  const [tab, setTab] = useState('bookings');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([bookingsService.list(), bookingsService.collections(30)]);
      setRows(b); setCollections(c);
    } catch { setRows([]); setCollections({ rows: [], overdueTotal: 0, dueTotal: 0 }); } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const live = (rows || []).filter((b) => b.status !== 'Cancelled');
    return {
      count: live.length,
      paid: live.reduce((s, b) => s + b.summary.paid, 0),
      overdue: live.reduce((s, b) => s + b.summary.overdue, 0),
    };
  }, [rows]);

  const filtered = (rows || []).filter((b) => !q || `${b.buyerName} ${b.projectName} ${b.unit?.unitNumber} ${b.id}`.toLowerCase().includes(q.toLowerCase()));

  const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    pageTitle: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
    stats: { flexDirection: 'row', gap: 8, padding: spacing.screenH, paddingBottom: 0 },
    stat: { flex: 1, backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 10 },
    statLabel: { color: colors.text.muted, fontSize: 11 },
    statValue: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginTop: 2 },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.screenH, marginTop: spacing.md },
    tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: spacing.radius.full, borderWidth: 1, borderColor: colors.border.default },
    tabOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
    tabText: { color: colors.text.secondary, fontWeight: typography.weight.medium },
    search: { margin: spacing.screenH, marginBottom: 8, borderWidth: 1, borderColor: colors.border.default, borderRadius: spacing.radius.md, padding: 10, color: colors.text.primary, backgroundColor: colors.bg.secondary },
    card: { marginHorizontal: spacing.screenH, marginBottom: 8, backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: spacing.md },
    name: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
    sub: { color: colors.text.muted, fontSize: typography.size.sm, marginTop: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    bar: { height: 6, borderRadius: 3, backgroundColor: colors.bg.tertiary, marginTop: 8, overflow: 'hidden' },
    empty: { color: colors.text.muted, textAlign: 'center', marginTop: 40 },
  });

  const Booking = ({ item: b }) => (
    <TouchableOpacity style={s.card} onPress={() => navigation.navigate('BookingDetail', { id: b.id, name: b.buyerName })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.name}>{b.buyerName}</Text>
        <Text style={{ color: STATUS_COLOR[b.status] || colors.text.muted, fontWeight: '600' }}>{b.status}</Text>
      </View>
      <Text style={s.sub}>{b.projectName} · {b.unit?.unitNumber || '—'} · {shortDate(b.bookingDate)}</Text>
      <View style={s.bar}><View style={{ width: `${Math.min(100, b.summary.percentPaid)}%`, height: 6, backgroundColor: '#34D399' }} /></View>
      <View style={s.row}>
        <Text style={s.sub}>{inr(b.summary.paid)} of {inr(b.agreementValue)}</Text>
        {b.summary.overdue > 0 && <Text style={{ color: '#F87171', fontWeight: '600' }}>Overdue {inr(b.summary.overdue)}</Text>}
      </View>
    </TouchableOpacity>
  );

  const Due = ({ item: r }) => (
    <TouchableOpacity style={s.card} onPress={() => navigation.navigate('BookingDetail', { id: r.bookingId, name: r.buyerName })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.name}>{r.buyerName}</Text>
        <Text style={{ color: r.overdue ? '#F87171' : '#FBBF24', fontWeight: '600' }}>{r.overdue ? 'Overdue' : 'Due soon'}</Text>
      </View>
      <Text style={s.sub}>{r.milestone} · due {shortDate(r.dueDate)}</Text>
      <Text style={[s.name, { marginTop: 6 }]}>{inr(r.outstanding)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <TopBar onOpenDrawer={() => navigation.openDrawer()} />
      <Text style={s.pageTitle}>Bookings & Payments</Text>
      {rows === null ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand.primary} /> : (
        <>
          <View style={s.stats}>
            <View style={s.stat}><Text style={s.statLabel}>Bookings</Text><Text style={s.statValue}>{totals.count}</Text></View>
            <View style={s.stat}><Text style={s.statLabel}>Received</Text><Text style={[s.statValue, { color: '#34D399' }]}>{inr(totals.paid)}</Text></View>
            <View style={s.stat}><Text style={s.statLabel}>Overdue</Text><Text style={[s.statValue, totals.overdue > 0 && { color: '#F87171' }]}>{inr(totals.overdue)}</Text></View>
          </View>
          <View style={s.tabs}>
            {[['bookings', 'Bookings'], ['collections', 'Collections']].map(([k, l]) => (
              <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)}>
                <Text style={[s.tabText, tab === k && { color: '#fff' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {tab === 'bookings' && (
            <TextInput style={s.search} value={q} onChangeText={setQ} placeholder="Search buyer, project, unit…" placeholderTextColor={colors.text.muted} />
          )}
          <FlatList
            data={tab === 'bookings' ? filtered : (collections?.rows || []).map((r, i) => ({ ...r, key: `${r.bookingId}-${i}` }))}
            keyExtractor={(item) => item.key || item.id}
            renderItem={tab === 'bookings' ? Booking : Due}
            contentContainerStyle={{ paddingTop: tab === 'bookings' ? 0 : spacing.md, paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand.primary} />}
            ListEmptyComponent={<Text style={s.empty}>{tab === 'bookings' ? 'No bookings yet.' : 'Nothing due in the next 30 days.'}</Text>}
          />
        </>
      )}
    </View>
  );
}
