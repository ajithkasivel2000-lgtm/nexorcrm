import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { commsService } from '../services/comms';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';
const when = (v) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function useStyles() {
  const { colors } = useTheme();
  return {
    colors,
    s: StyleSheet.create({
      section: { marginBottom: spacing.md },
      title: { color: colors.brand.light, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, marginBottom: 8 },
      card: { backgroundColor: colors.bg.secondary, borderRadius: spacing.radius.md, borderWidth: 1, borderColor: colors.border.default, padding: spacing.md, gap: 8 },
      muted: { color: colors.text.muted, fontSize: typography.size.sm },
      text: { color: colors.text.primary, fontSize: typography.size.sm },
      bubbleIn: { alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: colors.bg.tertiary, borderRadius: 12, padding: 10 },
      bubbleOut: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: 'rgba(99,102,241,0.25)', borderRadius: 12, padding: 10 },
      meta: { color: colors.text.muted, fontSize: 11, marginTop: 4 },
      input: { borderWidth: 1, borderColor: colors.border.default, borderRadius: spacing.radius.md, color: colors.text.primary, padding: 10, minHeight: 44, backgroundColor: colors.bg.tertiary },
      btn: { backgroundColor: colors.brand.primary, borderRadius: spacing.radius.md, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
      btnGhost: { borderWidth: 1, borderColor: colors.border.default, borderRadius: spacing.radius.md, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
      btnText: { color: '#fff', fontWeight: typography.weight.semibold },
      btnGhostText: { color: colors.text.primary, fontWeight: typography.weight.medium },
      row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
      rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    }),
  };
}

/** WhatsApp conversation with the lead, sent through the company's WhatsApp number. */
export function WhatsAppPanel({ leadId, mobile }) {
  const { s, colors } = useStyles();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => commsService.whatsappThread(leadId).then(setMessages).catch(() => setMessages([])), [leadId]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await commsService.sendWhatsApp(leadId, { text }); setText(''); load(); } catch (e) { Alert.alert('WhatsApp', errMsg(e)); load(); } finally { setBusy(false); }
  };

  const digits = String(mobile || '').replace(/\D/g, '');
  const waNumber = digits.length === 10 ? `91${digits}` : digits;

  return (
    <View style={s.section}>
      <Text style={s.title}>WhatsApp</Text>
      <View style={s.card}>
        {messages === null && <ActivityIndicator color={colors.brand.primary} />}
        {messages?.length === 0 && <Text style={s.muted}>No WhatsApp messages yet.</Text>}
        {messages?.slice(-30).map((m) => (
          <View key={m.id} style={m.direction === 'in' ? s.bubbleIn : s.bubbleOut}>
            <Text style={s.text}>{m.template ? `Template: ${m.template}` : m.body}</Text>
            <Text style={s.meta}>{when(m.createdAt)}{m.direction === 'out' ? ` · ${m.status}` : ''}</Text>
          </View>
        ))}
        <TextInput style={s.input} value={text} onChangeText={setText} placeholder="Type a message…" placeholderTextColor={colors.text.muted} multiline />
        <View style={s.row}>
          <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={send} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send from CRM</Text>}
          </TouchableOpacity>
          {!!waNumber && (
            <TouchableOpacity style={s.btnGhost} onPress={() => Linking.openURL(`https://wa.me/${waNumber}`)}>
              <Text style={s.btnGhostText}>Open WhatsApp</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.meta}>Free text works within 24 hours of the customer's last message.</Text>
      </View>
    </View>
  );
}

/** Click-to-call through Exotel: rings your phone first, then the lead. */
export function CallsPanel({ leadId }) {
  const { s, colors } = useStyles();
  const [calls, setCalls] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => commsService.calls(leadId).then(setCalls).catch(() => {}), [leadId]);
  useEffect(() => { load(); }, [load]);

  const call = async () => {
    setBusy(true);
    try { const r = await commsService.placeCall(leadId); Alert.alert('Calling', r.message || 'Your phone will ring now.'); load(); } catch (e) { Alert.alert('Call', errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <View style={s.section}>
      <View style={s.rowBetween}>
        <Text style={s.title}>Calls</Text>
        <TouchableOpacity style={s.btn} onPress={call} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>📞 Call via CRM</Text>}
        </TouchableOpacity>
      </View>
      <View style={[s.card, { marginTop: 8 }]}>
        {calls.length === 0 && <Text style={s.muted}>No calls placed from the CRM yet.</Text>}
        {calls.map((c) => (
          <View key={c.id} style={s.rowBetween}>
            <Text style={s.text}>{when(c.startedAt)}</Text>
            <Text style={s.muted}>{c.status}{c.durationSec ? ` · ${Math.floor(c.durationSec / 60)}m ${c.durationSec % 60}s` : ''}</Text>
            {c.recordingUrl ? <TouchableOpacity onPress={() => Linking.openURL(c.recordingUrl)}><Text style={{ color: colors.text.link }}>Listen</Text></TouchableOpacity> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Files on the lead: upload from the phone, open or share. */
export function DocumentsPanel({ entityType = 'lead', entityId }) {
  const { s, colors } = useStyles();
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => commsService.documents(entityType, entityId).then(setDocs).catch(() => setDocs([])), [entityType, entityId]);
  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets?.[0]) return;
    const file = picked.assets[0];
    if (file.size && file.size > 10 * 1024 * 1024) { Alert.alert('Documents', 'Files must be under 10MB.'); return; }
    setBusy(true);
    try { await commsService.uploadDocument(entityType, entityId, { uri: file.uri, name: file.name, mimeType: file.mimeType }); load(); } catch (e) { Alert.alert('Upload', errMsg(e)); } finally { setBusy(false); }
  };

  const open = async (doc) => {
    try {
      const path = await commsService.downloadDocument(doc);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: doc.mimeType || undefined, dialogTitle: doc.fileName });
    } catch (e) { Alert.alert('Document', errMsg(e)); }
  };

  return (
    <View style={s.section}>
      <View style={s.rowBetween}>
        <Text style={s.title}>Documents</Text>
        <TouchableOpacity style={s.btnGhost} onPress={upload} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.brand.primary} /> : <Text style={s.btnGhostText}>+ Upload</Text>}
        </TouchableOpacity>
      </View>
      <View style={[s.card, { marginTop: 8 }]}>
        {docs === null && <ActivityIndicator color={colors.brand.primary} />}
        {docs?.length === 0 && <Text style={s.muted}>No documents yet.</Text>}
        {docs?.map((d) => (
          <TouchableOpacity key={d.id} onPress={() => open(d)} style={s.rowBetween}>
            <Text style={[s.text, { flex: 1 }]} numberOfLines={1}>📄 {d.fileName}</Text>
            <Text style={s.muted}>{d.category || ''}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
