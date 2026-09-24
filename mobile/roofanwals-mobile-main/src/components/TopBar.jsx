import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, ActivityIndicator, Alert, Image
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { notificationsService } from '../services/notifications';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

function fmt(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });
  } catch (_) { return ''; }
}

function HeaderIconButton({ onPress, children, borderColor }) {
  return (
    <TouchableOpacity style={[styles.iconBtn, { borderColor }]} onPress={onPress} activeOpacity={0.75}>
      {children}
    </TouchableOpacity>
  );
}

/** Row in the profile dropdown. */
function MenuItem({ icon, label, onPress, colors, danger }) {
  return (
    <TouchableOpacity
      style={styles.profileItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Feather name={icon} size={15} color={danger ? '#F87171' : colors.text.secondary} />
      <Text style={[styles.profileItemText, { color: danger ? '#F87171' : colors.text.primary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Web-style app header: hamburger, brand, then the right cluster —
 * theme toggle, notification bell (unread badge + dropdown), profile avatar.
 * Uses safe-area insets so it hugs the top edge on every device.
 */
export default function TopBar({ onOpenDrawer }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [profileOpen, setProfileOpen] = useState(false);

  const [panelOpen, setPanelOpen]   = useState(false);
  const [items, setItems]           = useState([]);
  const [unread, setUnread]         = useState(0);
  const [loading, setLoading]       = useState(false);
  const timer = useRef(null);

  const openPanel = useCallback(async () => {
    setPanelOpen(true);
    setLoading(true);
    try {
      const data = await notificationsService.list();
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnread(data.unread || 0);
    } catch (_) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAll = async () => {
    try {
      await notificationsService.markAllRead();
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (_) {}
    clearTimeout(timer.current);
    timer.current = setTimeout(openPanel, 400);
  };

  const markOne = async (n) => {
    if (n.read) return;
    try {
      await notificationsService.markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (_) {}
  };

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.secondary, borderBottomColor: colors.border.default, paddingTop: insets.top }]}>
      <View style={styles.row}>
        {/* Left: menu + brand */}
        <View style={styles.left}>
          <HeaderIconButton onPress={onOpenDrawer} borderColor={colors.border.default}>
            <Feather name="menu" size={18} color={colors.text.primary} />
          </HeaderIconButton>
          <View style={styles.brandRow}>
            <Svg width="32" height="32" viewBox="0 0 100 100">
              <Path d="M25,75 V35 A15,15 0 0,1 55,35 V60 L75,90" stroke="#097969" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M75,25 V65 A15,15 0 0,1 45,65 V40 L25,10" stroke="#097969" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <View style={{ flexDirection: 'column', marginLeft: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', letterSpacing: 0.5 }}>
                <Text style={{ color: '#097969' }}>NEXOR</Text>
                <Text style={{ color: '#1B4D3E' }}>CRM</Text>
              </Text>
              <Text style={{ fontSize: 11, color: '#4B5563', marginTop: -3, fontWeight: '600' }}>
                an innovative crm
              </Text>
            </View>
          </View>
        </View>

        {/* Right: theme, bell, avatar */}
        <View style={styles.right}>
          <HeaderIconButton onPress={toggleTheme} borderColor={colors.border.default}>
            <Feather name={isDark ? 'sun' : 'moon'} size={16} color={colors.text.primary} />
          </HeaderIconButton>

          <HeaderIconButton onPress={openPanel} borderColor={colors.border.default}>
            <Feather name="bell" size={16} color={colors.text.primary} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { borderColor: colors.bg.secondary }]}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </HeaderIconButton>

          {/* Profile avatar — opens the account dropdown, as the web header */}
          <TouchableOpacity activeOpacity={0.8} onPress={() => setProfileOpen(true)}>
            <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile dropdown — admin / My Profile / Settings / Logout */}
      <Modal
        visible={profileOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileOpen(false)}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setProfileOpen(false)}>
          <View style={[styles.profileMenu, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default, marginTop: insets.top + 60, marginRight: 10 }]}>
            {/* Signed-in user header */}
            <View style={styles.profileUserRow}>
              <Text style={[styles.profileUserName, { color: colors.text.primary }]} numberOfLines={1}>
                {user?.username || user?.name || 'admin'}
              </Text>
            </View>

            <MenuItem
              icon="user"
              label="My Profile"
              colors={colors}
              onPress={() => { setProfileOpen(false); navigation.navigate('MainTabs', { screen: 'Profile' }); }}
            />
            <MenuItem
              icon="settings"
              label="Settings"
              colors={colors}
              onPress={() => { setProfileOpen(false); navigation.navigate('MainTabs', { screen: 'Profile' }); }}
            />

            <View style={[styles.menuDivider, { backgroundColor: colors.border.subtle }]} />

            <MenuItem
              icon="log-out"
              label="Logout"
              colors={colors}
              danger
              onPress={() => {
                setProfileOpen(false);
                Alert.alert(
                  'Sign Out',
                  'Are you sure you want to sign out?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Logout', style: 'destructive', onPress: logout },
                  ]
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Notifications dropdown */}
      <Modal
        visible={panelOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPanelOpen(false)}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPanelOpen(false)}>
          <View style={[styles.panel, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default, marginTop: insets.top + 56 }]}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Notifications</Text>
              {unread > 0 && (
                <TouchableOpacity onPress={markAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.markAll, { color: colors.brand.light }]}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>

            {loading ? (
              <View style={styles.panelLoading}>
                <ActivityIndicator color={colors.brand.primary} />
              </View>
            ) : items.length === 0 ? (
              <View style={styles.panelEmpty}>
                <Feather name="bell-off" size={20} color={colors.text.muted} />
                <Text style={styles.emptyText}>You're all caught up</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item, i) => String(item.id || i)}
                style={styles.list}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.notifRow, !item.read && { backgroundColor: colors.brand.primary + '12' }]}
                    activeOpacity={0.75}
                    onPress={() => markOne(item)}
                  >
                    {!item.read && <View style={[styles.dot, { backgroundColor: colors.brand.primary }]} />}
                    <View style={styles.notifContent}>
                      <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
                      {item.body ? <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text> : null}
                      <Text style={styles.notifDate}>{fmt(item.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH - 6,
    height: 56,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoMark: {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  logoMarkText: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  brandName: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, letterSpacing: 0.4 },
  brandCrm: { color: '#FBBF24' },

  avatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 2,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  badge: {
    position: 'absolute',
    top: -3, right: -3,
    minWidth: 16, height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700', borderWidth: 1.5, borderColor: '#13161E', borderRadius: 8, overflow: 'hidden' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: {
    alignSelf: 'flex-end',
    width: 320,
    maxHeight: 420,
    marginRight: 12,
    borderRadius: spacing.radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  panelTitle: { color: '#F1F5F9', fontWeight: '700', fontSize: typography.size.sm },
  markAll: { fontSize: typography.size.xs, fontWeight: '600' },
  panelLoading: { padding: 32, alignItems: 'center' },
  panelEmpty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { color: '#94A3B8', fontSize: typography.size.sm },
  list: { maxHeight: 320 },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  notifContent: { flex: 1 },
  notifTitle: { color: '#F1F5F9', fontSize: typography.size.sm, fontWeight: '600' },
  notifBody: { color: '#94A3B8', fontSize: typography.size.xs, marginTop: 2 },
  notifDate: { color: '#64748B', fontSize: typography.size.xs, marginTop: 3 },

  // Profile dropdown
  profileMenu: {
    alignSelf: 'flex-end',
    width: 210,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  profileUserRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.22)',
  },
  profileUserName: { fontSize: typography.size.sm, fontWeight: '600' },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  profileItemText: { fontSize: typography.size.sm },
  menuDivider: { height: 1 },
});
