import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Image, Alert,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { teamChatService } from '../../services/teamChat';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

/** How often to look for new messages while a room is open. */
const POLL_MS = 4000;

const initials = (name) => String(name || '?').trim().slice(0, 2).toUpperCase();

const timeLabel = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
};

function dayLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Relative time for the room list — "now", "14:02", "Yesterday", a date. */
function whenLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  if (Date.now() - d.getTime() < 60000) return 'now';
  const day = dayLabel(value);
  return day === 'Today' ? timeLabel(value) : day;
}

/**
 * Team Chat — the mobile twin of the web team chat: room list with search,
 * unread badges and "New" composer, and a polled conversation thread with
 * photo messages, @mentions, members sheet, leave/delete.
 */
export default function TeamChatScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const me = user?.username || user?.name || null;

  /* Phones show one pane at a time (list → thread with a back button);
     tablets/wide screens keep the web-style two-pane layout. */
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 768;

  const [rooms, setRooms]         = useState([]);
  const [activeId, setActiveId]   = useState(null);
  const [room, setRoom]           = useState(null);
  const [messages, setMessages]   = useState([]);
  const [draft, setDraft]         = useState('');
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState('');
  const [booting, setBooting]     = useState(true);

  const [composing, setComposing] = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [picked, setPicked]       = useState([]);
  const [groupName, setGroupName] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [sending, setSending]     = useState(false);
  const [lightbox, setLightbox]   = useState(null);

  // The newest message already on screen; the poll asks for anything after it.
  const lastAtRef = useRef(null);
  const listRef = useRef(null);

  /* ---- the room list ----------------------------------------------------- */
  const refreshRooms = useCallback(async () => {
    try {
      const data = await teamChatService.listRooms();
      setRooms(Array.isArray(data) ? data : (data?.rooms || []));
    } catch (err) {
      if (err?.response?.status === 401) setError('Sign in again to use chat.');
    }
  }, []);

  /* ---- opening a room ---------------------------------------------------- */
  const openRoom = useCallback(async (id) => {
    setActiveId(id);
    setShowMembers(false);
    setError('');
  }, []);

  const closeRoom = useCallback(() => {
    setActiveId(null);
    setRoom(null);
    setMessages([]);
    lastAtRef.current = null;
  }, []);

  useEffect(() => {
    if (!activeId) return undefined;
    let alive = true;

    (async () => {
      try {
        const [detail, thread] = await Promise.all([
          teamChatService.getRoom(activeId),
          teamChatService.listMessages(activeId),
        ]);
        if (!alive) return;
        setRoom(detail);
        setMessages(thread || []);
        lastAtRef.current = thread?.length ? thread[thread.length - 1].createdAt : null;
        teamChatService.markRead(activeId).catch(() => {});
        refreshRooms();
      } catch (err) {
        if (alive) setError(err?.response?.data?.message || 'Could not open that chat.');
      }
    })();

    return () => { alive = false; };
  }, [activeId, refreshRooms]);

  /* ---- new messages ------------------------------------------------------ */
  useEffect(() => {
    if (!activeId) return undefined;

    const tick = async () => {
      try {
        const fresh = await teamChatService.listMessages(activeId, lastAtRef.current || undefined);
        if (!fresh || fresh.length === 0) return;
        lastAtRef.current = fresh[fresh.length - 1].createdAt;
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...fresh.filter((m) => !known.has(m.id))];
        });
        teamChatService.markRead(activeId).catch(() => {});
        refreshRooms();
      } catch { /* a dropped poll is not worth reporting; the next one retries */ }
    };

    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [activeId, refreshRooms]);

  /* ---- load rooms on focus ---------------------------------------------- */
  useFocusEffect(useCallback(() => {
    (async () => {
      await refreshRooms();
      setBooting(false);
    })();
  }, [refreshRooms]));

  /* ---- sending ----------------------------------------------------------- */
  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || sending) return;

    setDraft('');
    setMentionQuery(null);
    setError('');
    setSending(true);
    const pending = {
      id: `local-${Date.now()}`, sender: me, body, kind: 'text', createdAt: new Date().toISOString(), pending: true,
    };
    setMessages((prev) => [...prev, pending]);

    try {
      const saved = await teamChatService.sendMessage(activeId, body, 'text');
      lastAtRef.current = saved.createdAt;
      setMessages((prev) => prev.map((m) => (m.id === pending.id ? saved : m)));
      refreshRooms();
    } catch (err) {
      setError(err?.response?.data?.message || 'That message did not send.');
      setMessages((prev) => prev.map((m) => (m.id === pending.id ? { ...m, failed: true } : m)));
    } finally {
      setSending(false);
    }
  };

  const pickPhoto = async () => {
    if (!activeId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Photo library permission is needed to send photos.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if ((asset.fileSize || 0) > 4 * 1024 * 1024) { setError('Image too large. Under 4MB please.'); return; }

    const mime = asset.mimeType || 'image/jpeg';
    const body = `data:${mime};base64,${asset.base64}`;
    const pending = { id: `local-${Date.now()}`, sender: me, body, kind: 'photo', createdAt: new Date().toISOString(), pending: true };
    setMessages((prev) => [...prev, pending]);

    try {
      const saved = await teamChatService.sendMessage(activeId, body, 'photo');
      lastAtRef.current = saved.createdAt;
      setMessages((prev) => prev.map((m) => (m.id === pending.id ? saved : m)));
      refreshRooms();
    } catch (err) {
      setError(err?.response?.data?.message || 'Photo did not send.');
      setMessages((prev) => prev.map((m) => (m.id === pending.id ? { ...m, failed: true } : m)));
    }
  };

  /* ---- @mentions --------------------------------------------------------- */
  const handleDraftChange = (val) => {
    setDraft(val);
    const match = val.match(/@([a-zA-Z0-9_]*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const mentionCandidates = useMemo(() => (
    mentionQuery === null ? [] : contacts.filter((c) => c.username.toLowerCase().startsWith(mentionQuery)).slice(0, 6)
  ), [mentionQuery, contacts]);

  const insertMention = (username) => {
    setDraft((prev) => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${username} `));
    setMentionQuery(null);
  };

  /* ---- starting a chat --------------------------------------------------- */
  const openComposer = async () => {
    setComposing(true);
    setPicked([]);
    setGroupName('');
    try {
      const list = await teamChatService.getContacts();
      setContacts(Array.isArray(list) ? list : (list?.contacts || []));
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load the people list.');
    }
  };

  const togglePicked = (username) => {
    setPicked((prev) => (prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]));
  };

  const startChat = async () => {
    if (picked.length === 0) return;
    try {
      const created = await teamChatService.createRoom(picked.length > 1 ? groupName.trim() : '', picked);
      setComposing(false);
      await refreshRooms();
      setActiveId(created.id);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not start that chat.');
    }
  };

  /* ---- membership -------------------------------------------------------- */
  const invite = () => {
    const notIn = contacts.filter((c) => !room?.members?.some((m) => m.username === c.username));
    if (notIn.length === 0) { setError('Everyone is already in this group.'); return; }
    setComposing(true);
    setPicked([]);
    setGroupName('');
    // reuse the composer; picking from here adds to the existing group
    setGroupName('__ADD_MEMBERS__');
  };

  // If the composer is in "add members" mode, Start adds instead of creating.
  const composerIsAddMembers = groupName === '__ADD_MEMBERS__';

  const composerStart = async () => {
    if (picked.length === 0) return;
    try {
      if (composerIsAddMembers && activeId) {
        await teamChatService.addMembers(activeId, picked);
        setComposing(false);
        setRoom(await teamChatService.getRoom(activeId));
        const fresh = await teamChatService.listMessages(activeId, lastAtRef.current || undefined);
        if (fresh?.length) {
          lastAtRef.current = fresh[fresh.length - 1].createdAt;
          setMessages((prev) => [...prev, ...fresh]);
        }
      } else {
        const created = await teamChatService.createRoom(picked.length > 1 ? groupName.trim() : '', picked);
        setComposing(false);
        await refreshRooms();
        setActiveId(created.id);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not add them.');
    }
  };

  const leave = () => {
    Alert.alert('Leave chat', `Leave ${room?.name}? You will stop receiving its messages.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          try {
            await teamChatService.removeMember(activeId, me);
            closeRoom();
            refreshRooms();
          } catch (err) {
            setError(err?.response?.data?.message || 'Could not leave.');
          }
        },
      },
    ]);
  };

  const removeGroup = () => {
    Alert.alert(
      'Delete group',
      `Delete "${room?.name}" for everyone? All messages will be lost. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await teamChatService.deleteRoom(activeId);
              closeRoom();
              refreshRooms();
            } catch (err) {
              setError(err?.response?.data?.message || 'Could not delete the group.');
            }
          },
        },
      ],
    );
  };

  /* ---- rendering --------------------------------------------------------- */
  const visibleRooms = rooms.filter((r) => {
    const q = filter.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || (r.last?.body || '').toLowerCase().includes(q);
  });

  const themed = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    body: { flex: 1, flexDirection: 'row', paddingHorizontal: spacing.screenH, paddingBottom: spacing.sm },

    /* Room list */
    listPane: {
      width: isWide ? 290 : '100%',
      flexShrink: 0,
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1, borderColor: colors.border.default,
      marginRight: isWide ? spacing.md : 0,
      overflow: 'hidden',
    },
    threadPanePhone: { flex: 1, width: '100%' },
    listHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
    },
    heading: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
    newBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1, borderColor: colors.brand.primary,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    },
    newBtnText: { color: colors.brand.primary, fontSize: typography.size.xs, fontWeight: '600' },
    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginHorizontal: spacing.md, marginBottom: spacing.sm,
      borderWidth: 1, borderColor: colors.border.default,
      borderRadius: 18, paddingHorizontal: 10, height: 34,
      backgroundColor: colors.bg.tertiary,
    },
    searchText: { flex: 1, color: colors.text.primary, fontSize: typography.size.xs },
    rooms: { flex: 1 },
    roomRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: spacing.md, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
    },
    roomRowActive: { backgroundColor: colors.brand.primary + '14' },
    avatar: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: colors.brand.primary + '22',
      alignItems: 'center', justifyContent: 'center',
    },
    avatarGroup: { backgroundColor: colors.brand.primary },
    avatarText: { color: colors.brand.primary, fontSize: 12, fontWeight: '700' },
    avatarGroupText: { color: '#fff' },
    roomText: { flex: 1 },
    roomTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    roomName: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600', flexShrink: 1 },
    roomWhen: { color: colors.text.muted, fontSize: 10, marginLeft: 6 },
    roomBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
    roomLast: { color: colors.text.muted, fontSize: 11, flexShrink: 1 },
    badge: {
      minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
      backgroundColor: colors.brand.primary,
      alignItems: 'center', justifyContent: 'center', marginLeft: 6,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
    listEmpty: { color: colors.text.muted, fontSize: typography.size.xs, textAlign: 'center', paddingVertical: 24, paddingHorizontal: 12 },

    /* Thread pane */
    threadPane: {
      flex: 1,
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1, borderColor: colors.border.default,
      overflow: 'hidden',
    },
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
    placeholderTitle: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    placeholderText: { color: colors.text.muted, fontSize: typography.size.xs, textAlign: 'center', maxWidth: 260 },

    threadHead: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: spacing.sm, paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: colors.border.default,
      backgroundColor: colors.bg.tertiary,
    },
    threadName: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    threadSub: { color: colors.text.muted, fontSize: 10, marginTop: 1 },
    iconBtn: { padding: 6, borderRadius: 8 },
    membersWrap: {
      paddingHorizontal: spacing.md, paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: colors.border.default,
      flexDirection: 'row', flexWrap: 'wrap', gap: 6,
      backgroundColor: colors.bg.tertiary,
    },
    memberChip: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.default,
      borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
    },
    memberText: { color: colors.text.secondary, fontSize: 10 },

    thread: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
    dayWrap: { alignItems: 'center', marginVertical: 8 },
    dayPill: {
      color: colors.text.muted, fontSize: 10, fontWeight: '600',
      backgroundColor: colors.bg.tertiary,
      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', marginBottom: 6 },
    rowMine: { justifyContent: 'flex-end' },
    bubble: {
      maxWidth: '78%', borderRadius: 14,
      backgroundColor: colors.bg.tertiary,
      paddingHorizontal: 10, paddingVertical: 7,
    },
    bubbleMine: { backgroundColor: colors.brand.primary },
    bubbleFailed: { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2' },
    sender: { color: colors.text.muted, fontSize: 10, fontWeight: '700', marginBottom: 2 },
    text: { color: colors.text.primary, fontSize: typography.size.xs, lineHeight: 17 },
    textMine: { color: '#fff' },
    mention: { color: '#FDE68A', fontWeight: '700' },
    photo: { width: 190, height: 190, borderRadius: 8, backgroundColor: colors.bg.tertiary },
    meta: {
      alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 3,
      color: colors.text.muted, fontSize: 9, marginTop: 2,
    },
    metaMine: { color: 'rgba(255,255,255,0.8)' },
    system: {
      alignSelf: 'center', color: colors.text.muted, fontSize: 10,
      backgroundColor: colors.bg.tertiary, borderRadius: 999,
      paddingHorizontal: 10, paddingVertical: 3, marginVertical: 4, overflow: 'hidden',
    },

    composerWrap: { position: 'relative' },
    mentionsMenu: {
      position: 'absolute', bottom: '100%', left: 0, right: 0,
      backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.default,
      borderRadius: 8, marginBottom: 4, maxHeight: 150, overflow: 'hidden', zIndex: 10,
    },
    mentionRow: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
    mentionName: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600' },
    mentionSub: { color: colors.text.muted, fontSize: 10 },
    composer: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: spacing.sm, paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: colors.border.default,
      backgroundColor: colors.bg.tertiary,
    },
    input: {
      flex: 1, color: colors.text.primary, fontSize: typography.size.xs,
      backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.default,
      borderRadius: 18, paddingHorizontal: 12, paddingVertical: Platform.select({ android: 6, ios: 8 }),
      maxHeight: 90,
    },
    sendBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.brand.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: colors.bg.tertiary },

    errorBar: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: isDark ? '#450A0A' : '#FEE2E2',
      paddingHorizontal: spacing.md, paddingVertical: 6,
    },
    errorText: { color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: typography.size.xs, flex: 1 },

    /* Start-chat modal */
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg.secondary,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '85%', paddingBottom: 30,
    },
    sheetHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs,
    },
    sheetTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
    sheetHint: { color: colors.text.muted, fontSize: typography.size.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    pickRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: spacing.lg, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
    },
    pickCheck: {
      width: 16, height: 16, borderRadius: 4, borderWidth: 1.5,
      borderColor: colors.text.muted, alignItems: 'center', justifyContent: 'center',
    },
    pickCheckOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
    pickName: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    pickSub: { color: colors.text.muted, fontSize: 10 },
    groupNameInput: {
      marginHorizontal: spacing.lg, marginTop: spacing.sm,
      borderWidth: 1, borderColor: colors.border.default, borderRadius: 8,
      backgroundColor: colors.bg.tertiary, paddingHorizontal: 12,
      color: colors.text.primary, height: 42, fontSize: typography.size.sm,
    },
    sheetFoot: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    },
    pickedLabel: { color: colors.text.muted, fontSize: typography.size.xs, flex: 1 },
    startBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 9,
      paddingHorizontal: 18, paddingVertical: 9,
    },
    startBtnDisabled: { opacity: 0.5 },
    startBtnText: { color: '#fff', fontSize: typography.size.sm, fontWeight: '600' },

    lightboxBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
    lightboxImage: { width: '100%', height: '80%' },
    lightboxClose: { position: 'absolute', top: 48, right: 20, padding: 8 },
  });

  const Avatar = ({ r, size = 34 }) => (
    <View style={[themed.avatar, r?.isGroup && themed.avatarGroup, { width: size, height: size, borderRadius: size / 2 }]}>
      {r?.isGroup
        ? <Feather name="users" size={14} color="#fff" />
        : <Text style={[themed.avatarText, r?.isGroup && themed.avatarGroupText, { fontSize: size * 0.35 }]}>{initials(r?.name)}</Text>}
    </View>
  );

  const renderRoom = ({ item }) => (
    <TouchableOpacity
      style={[themed.roomRow, item.id === activeId && themed.roomRowActive]}
      activeOpacity={0.7}
      onPress={() => openRoom(item.id)}
    >
      <Avatar r={item} />
      <View style={themed.roomText}>
        <View style={themed.roomTop}>
          <Text style={themed.roomName} numberOfLines={1}>{item.name}</Text>
          <Text style={themed.roomWhen}>{whenLabel(item.last?.createdAt || item.updatedAt)}</Text>
        </View>
        <View style={themed.roomBottom}>
          <Text style={themed.roomLast} numberOfLines={1}>
            {item.last
              ? `${item.last.sender === me ? 'You: ' : item.isGroup ? `${item.last.sender}: ` : ''}${item.last.kind === 'photo' ? '📷 Photo' : item.last.body}`
              : 'No messages yet'}
          </Text>
          {item.unread > 0 ? (
            <View style={themed.badge}><Text style={themed.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text></View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderMessage = ({ item: m, index }) => {
    const mine = m.sender === me;
    const system = m.kind === 'system';
    const previous = messages[index - 1];
    const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(m.createdAt);
    const showSender = room?.isGroup && !mine && !system
      && (!previous || previous.sender !== m.sender || newDay);

    if (system) {
      return (
        <View>
          {newDay ? <View style={themed.dayWrap}><Text style={themed.dayPill}>{dayLabel(m.createdAt)}</Text></View> : null}
          <Text style={themed.system}>{m.body}</Text>
        </View>
      );
    }

    const parts = String(m.body || '').split(/(@[a-zA-Z0-9_]+)/g);

    return (
      <View>
        {newDay ? <View style={themed.dayWrap}><Text style={themed.dayPill}>{dayLabel(m.createdAt)}</Text></View> : null}
        <View style={[themed.row, mine && themed.rowMine]}>
          <View style={[themed.bubble, mine && themed.bubbleMine, m.failed && themed.bubbleFailed]}>
            {showSender ? <Text style={themed.sender}>{m.sender}</Text> : null}
            {m.kind === 'photo' ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setLightbox(m.body)}>
                <Image source={{ uri: m.body }} style={themed.photo} resizeMode="cover" />
              </TouchableOpacity>
            ) : (
              <Text style={[themed.text, mine && themed.textMine]}>
                {parts.map((part, i) => (
                  part.startsWith('@')
                    ? <Text key={i} style={themed.mention}>{part}</Text>
                    : <Text key={i}>{part}</Text>
                ))}
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
              <Text style={[themed.meta, mine && themed.metaMine]}>{timeLabel(m.createdAt)}</Text>
              {mine ? (
                m.failed
                  ? <Feather name="x" size={11} color={isDark ? '#FCA5A5' : '#B91C1C'} />
                  : m.pending
                    ? <Feather name="check" size={11} color="rgba(255,255,255,0.8)" />
                    : <Feather name="check-circle" size={11} color="rgba(255,255,255,0.9)" />
              ) : null}
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (!me) {
    return (
      <View style={[themed.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <TopBar onOpenDrawer={() => navigation?.openDrawer?.()} />
        <Text style={{ color: colors.text.muted, marginTop: 120 }}>Sign in to use team chat.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={themed.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar onOpenDrawer={() => navigation?.openDrawer?.()} />

      {error ? (
        <View style={themed.errorBar}>
          <Text style={themed.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color={isDark ? '#FCA5A5' : '#B91C1C'} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={themed.body}>
        {/* ---- rooms ---- */}
        {(!activeId || isWide) && (
        <View style={themed.listPane}>
          <View style={themed.listHead}>
            <Text style={themed.heading}>Team Chat</Text>
            <TouchableOpacity style={themed.newBtn} activeOpacity={0.75} onPress={openComposer}>
              <Feather name="message-square" size={13} color={colors.brand.primary} />
              <Text style={themed.newBtnText}>New</Text>
            </TouchableOpacity>
          </View>

          <View style={themed.searchWrap}>
            <Feather name="search" size={13} color={colors.text.muted} />
            <TextInput
              style={themed.searchText}
              value={filter}
              onChangeText={setFilter}
              placeholder="Search chats"
              placeholderTextColor={colors.text.muted}
            />
          </View>

          {booting ? (
            <ActivityIndicator color={colors.brand.primary} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              style={themed.rooms}
              data={visibleRooms}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderRoom}
              ListEmptyComponent={
                <Text style={themed.listEmpty}>
                  {rooms.length === 0 ? 'No chats yet. Start one with New.' : 'Nothing matches that.'}
                </Text>
              }
            />
          )}
        </View>
        )}

        {/* ---- conversation ---- */}
        {(activeId || isWide) && (
        <View style={[themed.threadPane, !isWide && themed.threadPanePhone]}>
          {!activeId && (
            <View style={themed.placeholder}>
              <Feather name="users" size={34} color={colors.text.muted} />
              <Text style={themed.placeholderTitle}>Pick a chat, or start one</Text>
              <Text style={themed.placeholderText}>
                Messages here stay inside the CRM and are only visible to the people in the chat.
              </Text>
            </View>
          )}

          {activeId && room && (
            <>
              <View style={themed.threadHead}>
                {!isWide ? (
                  <TouchableOpacity style={themed.iconBtn} onPress={closeRoom} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Feather name="arrow-left" size={16} color={colors.text.primary} />
                  </TouchableOpacity>
                ) : null}
                <Avatar r={room} />
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.8} onPress={() => setShowMembers((v) => !v)}>
                  <Text style={themed.threadName} numberOfLines={1}>{room.name}</Text>
                  <Text style={themed.threadSub} numberOfLines={1}>
                    {room.members.map((m) => (m.username === me ? 'You' : m.username)).join(', ')}
                  </Text>
                </TouchableOpacity>
                {room.isGroup && room.isAdmin ? (
                  <TouchableOpacity style={themed.iconBtn} onPress={invite} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Feather name="user-plus" size={15} color={colors.text.muted} />
                  </TouchableOpacity>
                ) : null}
                {room.isGroup && room.isAdmin ? (
                  <TouchableOpacity style={themed.iconBtn} onPress={removeGroup} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Feather name="trash-2" size={15} color="#EF4444" />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={themed.iconBtn} onPress={leave} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Feather name="log-out" size={15} color={colors.text.muted} />
                </TouchableOpacity>
              </View>

              {showMembers ? (
                <View style={themed.membersWrap}>
                  {room.members.map((m) => (
                    <View key={m.username} style={themed.memberChip}>
                      <Text style={themed.memberText}>
                        {m.username === me ? `${m.username} (you)` : m.username}
                        {m.isAdmin ? ' · admin' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <FlatList
                ref={listRef}
                style={themed.thread}
                data={messages}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderMessage}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
              />

              <View style={themed.composerWrap}>
                {mentionCandidates.length > 0 ? (
                  <View style={themed.mentionsMenu}>
                    {mentionCandidates.map((c) => (
                      <TouchableOpacity key={c.username} style={themed.mentionRow} onPress={() => insertMention(c.username)}>
                        <Text style={themed.mentionName}>{c.username}</Text>
                        {c.name !== c.username ? <Text style={themed.mentionSub}>{c.name}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <View style={themed.composer}>
                  <TouchableOpacity onPress={pickPhoto} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="image" size={18} color={colors.text.muted} />
                  </TouchableOpacity>
                  <TextInput
                    style={themed.input}
                    value={draft}
                    onChangeText={handleDraftChange}
                    placeholder={`Message ${room.name}`}
                    placeholderTextColor={colors.text.muted}
                    multiline
                  />
                  <TouchableOpacity
                    style={[themed.sendBtn, !draft.trim() && themed.sendBtnDisabled]}
                    disabled={!draft.trim() || sending}
                    onPress={send}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {sending
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Feather name="send" size={14} color="#fff" />}
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
        )}
      </View>

      {/* ---- start a chat ---- */}
      <Modal visible={composing} transparent animationType="slide" onRequestClose={() => setComposing(false)}>
        <TouchableOpacity style={themed.backdrop} activeOpacity={1} onPress={() => setComposing(false)}>
          <TouchableOpacity activeOpacity={1} style={themed.sheet}>
            <View style={themed.sheetHead}>
              <Text style={themed.sheetTitle}>{composerIsAddMembers ? 'Add to group' : 'Start a chat'}</Text>
              <TouchableOpacity onPress={() => setComposing(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            <Text style={themed.sheetHint}>
              {composerIsAddMembers
                ? 'Pick the people to add to this group.'
                : 'Pick one person for a direct chat, or several for a group. Only people with an account here can be added.'}
            </Text>

            <FlatList
              data={contacts}
              keyExtractor={(item) => item.username}
              style={{ maxHeight: 340 }}
              ListEmptyComponent={<Text style={themed.listEmpty}>Nobody else has an account yet.</Text>}
              renderItem={({ item: c }) => (
                <TouchableOpacity style={themed.pickRow} activeOpacity={0.7} onPress={() => togglePicked(c.username)}>
                  <View style={[themed.pickCheck, picked.includes(c.username) && themed.pickCheckOn]}>
                    {picked.includes(c.username) ? <Feather name="check" size={11} color="#fff" /> : null}
                  </View>
                  <View style={themed.avatar}>
                    <Text style={themed.avatarText}>{initials(c.username)}</Text>
                  </View>
                  <View>
                    <Text style={themed.pickName}>{c.username}</Text>
                    {c.name !== c.username ? <Text style={themed.pickSub}>{c.name}</Text> : null}
                  </View>
                </TouchableOpacity>
              )}
            />

            {!composerIsAddMembers && picked.length > 1 ? (
              <TextInput
                style={themed.groupNameInput}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Group name (optional)"
                placeholderTextColor={colors.text.muted}
              />
            ) : null}

            <View style={themed.sheetFoot}>
              <Text style={themed.pickedLabel}>
                {composerIsAddMembers
                  ? (picked.length === 0 ? 'Nobody picked' : `Add ${picked.length} people`)
                  : picked.length === 0 ? 'Nobody picked'
                    : picked.length === 1 ? `Direct chat with ${picked[0]}`
                      : `Group of ${picked.length + 1}, including you`}
              </Text>
              <TouchableOpacity
                style={[themed.startBtn, picked.length === 0 && themed.startBtnDisabled]}
                disabled={picked.length === 0}
                onPress={composerIsAddMembers ? composerStart : startChat}
              >
                <Text style={themed.startBtnText}>{composerIsAddMembers ? 'Add' : 'Start'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ---- photo lightbox ---- */}
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <TouchableOpacity style={themed.lightboxBackdrop} activeOpacity={1} onPress={() => setLightbox(null)}>
          <TouchableOpacity activeOpacity={1} style={themed.lightboxClose} onPress={() => setLightbox(null)}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
          {lightbox ? <Image source={{ uri: lightbox }} style={themed.lightboxImage} resizeMode="contain" /> : null}
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}
