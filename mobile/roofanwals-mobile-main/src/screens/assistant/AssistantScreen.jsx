import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { assistantService } from '../../services/assistant';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

/** A stable id for a message that exists only on screen so far. */
let localId = 0;
const nextLocalId = () => `local-${(localId += 1)}`;

function dayLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const timeLabel = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const when = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Assistant — the mobile twin of the web assistant page: searchable past
 * conversations down the side, and the NexorCRM Assistant thread with
 * suggestion chips, step lists, "Open <screen>" links and related-question
 * chips.
 */
export default function AssistantScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const signedIn = Boolean(user);

  /* Phones show one pane at a time (list → thread with a back button);
     tablets/wide screens keep the web-style two-pane layout. */
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 768;

  const [messages, setMessages]         = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations]   = useState([]);
  const [suggestions, setSuggestions]   = useState([]);
  const [input, setInput]               = useState('');
  const [thinking, setThinking]         = useState(false);
  const [error, setError]               = useState('');
  const [filter, setFilter]             = useState('');
  const [booting, setBooting]           = useState(true);
  const [mobileView, setMobileView]     = useState('list'); // 'list' | 'chat'

  const listRef = useRef(null);
  // Guards the one-time restore, so refocusing does not reload over the
  // conversation already on screen.
  const restored = useRef(false);

  const refreshConversations = useCallback(async () => {
    try {
      const rows = await assistantService.listConversations();
      setConversations(Array.isArray(rows) ? rows : []);
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }, []);

  /* ---- opening: the prompts, and where the last conversation left off ---- */
  useEffect(() => {
    let alive = true;

    assistantService.getSuggestions()
      .then((r) => { if (alive) setSuggestions(r?.suggestions || []); })
      .catch(() => { /* it works without prompts */ });

    if (!restored.current) {
      restored.current = true;
      refreshConversations().then(async (rows) => {
        if (!alive || rows.length === 0) { setBooting(false); return; }
        try {
          const latest = await assistantService.getConversation(rows[0].id);
          if (!alive || !latest?.messages?.length) { setBooting(false); return; }
          setConversationId(latest.id);
          setMessages(latest.messages.map((m) => ({
            id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, sent: true,
          })));
        } catch { /* start fresh */ }
        setBooting(false);
      });
    } else {
      setBooting(false);
    }

    return () => { alive = false; };
  }, [refreshConversations]);

  /* ---- asking ------------------------------------------------------------ */
  const send = useCallback(async (text) => {
    const question = String(text ?? '').trim();
    if (!question || thinking) return;

    setError('');
    setInput('');

    const pending = {
      id: nextLocalId(), role: 'user', content: question,
      createdAt: new Date().toISOString(), sent: false,
    };
    setMessages((prev) => [...prev, pending]);
    setThinking(true);

    try {
      const result = await assistantService.ask(question, conversationId);
      setConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev.map((m) => (m.id === pending.id
          ? { ...m, id: result.question.id, sent: true, createdAt: result.question.createdAt }
          : m)),
        {
          id: result.reply.id,
          role: 'assistant',
          content: result.reply.answer,
          createdAt: result.reply.createdAt,
          title: result.reply.title,
          steps: result.reply.steps,
          screen: result.reply.screen,
          related: result.reply.related,
          suggestions: result.reply.suggestions,
          sent: true,
        },
      ]);
      refreshConversations();
    } catch (err) {
      setError(err?.response?.status === 401
        ? 'Sign in again to use the assistant.'
        : err?.response?.data?.message || 'The assistant could not be reached.');
    } finally {
      setThinking(false);
    }
  }, [conversationId, thinking, refreshConversations]);

  const startNew = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError('');
    setMobileView('chat');
  }, []);

  const openConversation = useCallback(async (id) => {
    try {
      const row = await assistantService.getConversation(id);
      setConversationId(row.id);
      setMessages((row.messages || []).map((m) => ({
        id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, sent: true,
      })));
      setError('');
      setMobileView('chat');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not open that conversation.');
    }
  }, []);

  const removeConversation = (id) => {
    Alert.alert('Delete conversation', 'Delete this conversation? The messages in it are removed for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await assistantService.deleteConversation(id);
            if (id === conversationId) startNew();
            refreshConversations();
          } catch (err) {
            setError(err?.response?.data?.message || 'Could not delete that conversation.');
          }
        },
      },
    ]);
  };

  /* Refresh the list every time the screen is focused. */
  useFocusEffect(useCallback(() => { refreshConversations(); }, [refreshConversations]));

  const visible = conversations.filter((c) => {
    const q = filter.trim().toLowerCase();
    return !q || c.title.toLowerCase().includes(q) || (c.preview || '').toLowerCase().includes(q);
  });

  const themed = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    body: { flex: 1, flexDirection: 'row', paddingHorizontal: spacing.screenH, paddingBottom: spacing.sm },

    /* Sidebar */
    side: {
      width: isWide ? 290 : '100%',
      flexShrink: 0,
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1, borderColor: colors.border.default,
      marginRight: isWide ? spacing.md : 0,
      overflow: 'hidden',
    },
    mainPhone: { flex: 1, width: '100%' },
    sideHead: {
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
    sideEmpty: { color: colors.text.muted, fontSize: typography.size.xs, textAlign: 'center', paddingVertical: 24, paddingHorizontal: 12 },
    convRow: {
      paddingHorizontal: spacing.md, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
    },
    convRowActive: { backgroundColor: colors.brand.primary + '14' },
    convTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    convTitle: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600', flexShrink: 1 },
    convWhen: { color: colors.text.muted, fontSize: 10, marginLeft: 6 },
    convPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
    convPreview: { color: colors.text.muted, fontSize: 11, flexShrink: 1 },
    delBtn: { padding: 3 },

    /* Main pane */
    main: {
      flex: 1,
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.sm,
      borderWidth: 1, borderColor: colors.border.default,
      overflow: 'hidden',
    },
    mainHead: {
      flexDirection: 'row', alignItems: 'center', gap: 9,
      paddingHorizontal: spacing.md, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.border.default,
    },
    backBtn: { padding: 4, marginRight: 2 },
    botAvatar: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.brand.primary + '1A',
      alignItems: 'center', justifyContent: 'center',
    },
    botName: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
    botStatus: { color: colors.text.muted, fontSize: 10, marginTop: 1 },

    thread: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
    dayWrap: { alignItems: 'center', marginVertical: 8 },
    dayPill: {
      color: colors.text.muted, fontSize: 10, fontWeight: '600',
      backgroundColor: colors.bg.tertiary,
      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden',
    },
    row: { flexDirection: 'row', marginBottom: 8 },
    rowMine: { justifyContent: 'flex-end' },
    bubble: {
      maxWidth: '82%', borderRadius: 14,
      backgroundColor: colors.bg.tertiary,
      paddingHorizontal: 11, paddingVertical: 8,
    },
    bubbleMine: { backgroundColor: colors.brand.primary },
    bubbleTyping: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 12 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text.muted },
    title: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '700', marginBottom: 3 },
    text: { color: colors.text.primary, fontSize: typography.size.xs, lineHeight: 17 },
    textMine: { color: '#fff' },
    step: { flexDirection: 'row', marginTop: 4, gap: 6 },
    stepNo: { color: colors.brand.primary, fontWeight: '700', fontSize: 11 },
    stepNoMine: { color: '#fff' },
    stepText: { color: colors.text.primary, fontSize: 11, flex: 1, lineHeight: 16 },
    stepTextMine: { color: '#fff' },
    linkBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      marginTop: 7, alignSelf: 'flex-start',
      backgroundColor: colors.brand.primary + '14',
      borderWidth: 1, borderColor: colors.brand.primary + '44',
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    },
    linkText: { color: colors.brand.primary, fontSize: 11, fontWeight: '600' },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
    chipsLabel: { color: colors.text.muted, fontSize: 10, alignSelf: 'center', marginRight: 2 },
    chip: {
      borderWidth: 1, borderColor: colors.border.default,
      backgroundColor: colors.bg.secondary,
      borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
    },
    chipText: { color: colors.text.secondary, fontSize: 10 },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 },
    meta: { color: colors.text.muted, fontSize: 9 },
    metaMine: { color: 'rgba(255,255,255,0.8)' },

    /* Welcome */
    welcome: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 18 },
    welcomeIcon: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: colors.brand.primary + '1A',
      alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    },
    welcomeTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '700', marginBottom: 6 },
    welcomeText: { color: colors.text.muted, fontSize: typography.size.xs, textAlign: 'center', lineHeight: 17 },

    composer: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: spacing.sm, paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: colors.border.default,
      backgroundColor: colors.bg.tertiary,
    },
    input: {
      flex: 1, color: colors.text.primary, fontSize: typography.size.xs,
      backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.default,
      borderRadius: 20, paddingHorizontal: 13,
      paddingVertical: 8, maxHeight: 90,
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
  });

  const renderMessage = ({ item: m, index }) => {
    const mine = m.role === 'user';
    const previous = messages[index - 1];
    const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(m.createdAt);

    return (
      <View>
        {newDay ? <View style={themed.dayWrap}><Text style={themed.dayPill}>{dayLabel(m.createdAt)}</Text></View> : null}
        <View style={[themed.row, mine && themed.rowMine]}>
          <View style={[themed.bubble, mine && themed.bubbleMine]}>
            {m.title ? <Text style={[themed.title, mine && { color: '#fff' }]}>{m.title}</Text> : null}
            <Text style={[themed.text, mine && themed.textMine]}>{m.content}</Text>

            {m.steps?.length > 0 ? (
              <View style={{ marginTop: 3 }}>
                {m.steps.map((step, i) => (
                  <View key={i} style={themed.step}>
                    <Text style={[themed.stepNo, mine && themed.stepNoMine]}>{i + 1}.</Text>
                    <Text style={[themed.stepText, mine && themed.stepTextMine]}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {m.screen?.path ? (
              <TouchableOpacity
                style={[themed.linkBtn, mine && { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.4)' }]}
                activeOpacity={0.75}
                onPress={() => navigation?.navigate?.('MainTabs', { screen: 'Dashboard' })}
              >
                <Text style={[themed.linkText, mine && { color: '#fff' }]}>Open {m.screen.label}</Text>
                <Feather name="arrow-right" size={12} color={mine ? '#fff' : colors.brand.primary} />
              </TouchableOpacity>
            ) : null}

            {m.related?.length > 0 ? (
              <View style={themed.chipsWrap}>
                <Text style={themed.chipsLabel}>Also about this:</Text>
                {m.related.map((r) => (
                  <TouchableOpacity key={r.id} style={themed.chip} activeOpacity={0.75} onPress={() => send(r.title)}>
                    <Text style={themed.chipText}>{r.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {m.suggestions?.length > 0 ? (
              <View style={themed.chipsWrap}>
                {m.suggestions.map((s) => (
                  <TouchableOpacity key={s} style={themed.chip} activeOpacity={0.75} onPress={() => send(s)}>
                    <Text style={themed.chipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={themed.metaRow}>
              <Text style={[themed.meta, mine && themed.metaMine]}>{timeLabel(m.createdAt)}</Text>
              {mine ? (
                m.sent
                  ? <Feather name="check-circle" size={11} color="rgba(255,255,255,0.9)" />
                  : <Feather name="check" size={11} color="rgba(255,255,255,0.8)" />
              ) : null}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderConv = ({ item }) => (
    <View style={[themed.convRow, item.id === conversationId && themed.convRowActive]}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.7} onPress={() => openConversation(item.id)}>
        <View style={themed.convTop}>
          <Text style={themed.convTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={themed.convWhen}>{when(item.updatedAt)}</Text>
        </View>
        <View style={themed.convPreviewRow}>
          <Text style={themed.convPreview} numberOfLines={1}>{item.preview || 'No messages yet'}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={themed.delBtn}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={() => removeConversation(item.id)}
      >
        <Feather name="trash-2" size={13} color={colors.text.muted} />
      </TouchableOpacity>
    </View>
  );

  const typingDots = thinking ? (
    <View style={themed.row}>
      <View style={[themed.bubble, themed.bubbleTyping]}>
        <View style={themed.dot} />
        <View style={[themed.dot, { opacity: 0.6 }]} />
        <View style={[themed.dot, { opacity: 0.3 }]} />
      </View>
    </View>
  ) : null;

  const threadData = thinking ? [...messages, { id: '__typing__', role: 'typing' }] : messages;

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation?.openDrawer?.()} />

      <View style={themed.body}>
        {/* ---- past conversations ---- */}
        {(isWide || mobileView === 'list') && (
        <View style={themed.side}>
          <View style={themed.sideHead}>
            <Text style={themed.heading}>Assistant</Text>
            <TouchableOpacity style={themed.newBtn} activeOpacity={0.75} onPress={startNew}>
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
              placeholder="Search conversations"
              placeholderTextColor={colors.text.muted}
            />
          </View>

          {booting ? (
            <ActivityIndicator color={colors.brand.primary} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={visible}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderConv}
              ListEmptyComponent={
                <Text style={themed.sideEmpty}>
                  {conversations.length === 0 ? 'Nothing yet. Ask a question to start.' : 'Nothing matches that.'}
                </Text>
              }
            />
          )}
        </View>
        )}

        {/* ---- the conversation ---- */}
        {(isWide || mobileView === 'chat') && (
        <View style={[themed.main, !isWide && themed.mainPhone]}>
          <View style={themed.mainHead}>
            {!isWide ? (
              <TouchableOpacity
                style={themed.backBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                onPress={() => setMobileView('list')}
              >
                <Feather name="arrow-left" size={16} color={colors.text.primary} />
              </TouchableOpacity>
            ) : null}
            <View style={themed.botAvatar}>
              <Feather name="star" size={15} color={colors.brand.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={themed.botName}>NexorCRM Assistant</Text>
              <Text style={themed.botStatus} numberOfLines={1}>
                {thinking ? 'typing…' : 'Answers questions about this application only'}
              </Text>
            </View>
          </View>

          <FlatList
            ref={listRef}
            style={themed.thread}
            data={threadData}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={themed.welcome}>
                <View style={themed.welcomeIcon}>
                  <Feather name="star" size={20} color={colors.brand.primary} />
                </View>
                <Text style={themed.welcomeTitle}>Ask me about NexorCRM</Text>
                <Text style={themed.welcomeText}>
                  I know how this CRM works — creating leads, duplicates, statuses, site visits, notifications, users and the rest. I only answer questions about this application.
                </Text>
                <View style={[themed.chipsWrap, { justifyContent: 'center', marginTop: 12 }]}>
                  {suggestions.map((s) => (
                    <TouchableOpacity key={s} style={themed.chip} activeOpacity={0.75} onPress={() => send(s)}>
                      <Text style={themed.chipText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            }
          />

          {error ? (
            <View style={themed.errorBar}>
              <Text style={themed.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={14} color={isDark ? '#FCA5A5' : '#B91C1C'} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={themed.composer}>
            <TextInput
              style={themed.input}
              value={input}
              onChangeText={setInput}
              placeholder={signedIn ? 'Ask a question…' : 'Sign in to ask'}
              placeholderTextColor={colors.text.muted}
              editable={signedIn}
              multiline
            />
            <TouchableOpacity
              style={[themed.sendBtn, (!input.trim() || thinking || !signedIn) && themed.sendBtnDisabled]}
              disabled={!input.trim() || thinking || !signedIn}
              onPress={() => send(input)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="send" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        )}
      </View>
    </View>
  );
}
