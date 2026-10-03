import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getUserPreferences, updateUserPreferences } from '../../../services/users';

const CustomToggle = ({ value, onValueChange }) => {
  return (
    <View style={styles.toggleWrap}>
      <TouchableOpacity 
        style={[styles.toggleBtn, value && styles.toggleBtnActive]} 
        onPress={() => onValueChange(true)}
      >
        <Text style={[styles.toggleText, value && styles.toggleTextActive]}>On</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.toggleBtn, !value && styles.toggleBtnInactive]} 
        onPress={() => onValueChange(false)}
      >
        <Text style={[styles.toggleText, !value && styles.toggleTextInactive]}>Off</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function NotificationsTab({ user }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    inAppNotifications: true,
    pushNotifications: true,
    emailNotifications: true,
    categoryPrefs: {
      leads: true,
      opportunities: true,
      tasks: true,
      projects: true,
      security: true,
      system: true
    }
  });

  useEffect(() => {
    loadPreferences();
  }, [user.id]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const data = await getUserPreferences(user.id);
      if (data) {
        setPrefs({
          inAppNotifications: data.inAppNotifications ?? true,
          pushNotifications: data.pushNotifications ?? true,
          emailNotifications: data.emailNotifications ?? true,
          categoryPrefs: data.categoryPrefs || {
            leads: true, opportunities: true, tasks: true, projects: true, security: true, system: true
          }
        });
      }
    } catch (e) {
      console.log('Error loading preferences:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateUserPreferences(user.id, prefs);
      Alert.alert('Success', 'Notification preferences updated.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update preferences.');
    } finally {
      setSaving(false);
    }
  };

  const updateCategory = (key, val) => {
    setPrefs(p => ({
      ...p,
      categoryPrefs: { ...p.categoryPrefs, [key]: val }
    }));
  };

  const renderRow = (title, sub, value, onChange) => (
    <View style={styles.row}>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <CustomToggle value={value} onValueChange={onChange} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg.primary }]}>
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.header}>
          <Feather name="bell" size={16} color="#4F46E5" />
          <View>
            <Text style={styles.title}>Notification Channels</Text>
            <Text style={styles.subtitle}>
              What this system can actually deliver: the in-app bell and browser push. Email uses the CRM's mail settings for lead events.
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          {renderRow('In-App Bell', 'The notifications panel inside the CRM.', prefs.inAppNotifications, (v) => setPrefs(p => ({ ...p, inAppNotifications: v })))}
          {renderRow('Browser Push', 'Delivered to devices where push was opted into.', prefs.pushNotifications, (v) => setPrefs(p => ({ ...p, pushNotifications: v })))}
          {renderRow('Email', 'Recorded as a preference; email delivery itself depends on the Mail Settings module.', prefs.emailNotifications, (v) => setPrefs(p => ({ ...p, emailNotifications: v })))}

          <View style={styles.sectionDivider}>
            <Text style={styles.sectionDividerText}>Per-category bell & push:</Text>
          </View>

          {renderRow('Lead notifications', 'New leads and handovers', prefs.categoryPrefs.leads, (v) => updateCategory('leads', v))}
          {renderRow('Opportunity notifications', 'Stage moves and assignments', prefs.categoryPrefs.opportunities, (v) => updateCategory('opportunities', v))}
          {renderRow('Task notifications', 'Tasks assigned to them', prefs.categoryPrefs.tasks, (v) => updateCategory('tasks', v))}
          {renderRow('Project notifications', 'Project updates', prefs.categoryPrefs.projects, (v) => updateCategory('projects', v))}
          {renderRow('Security notifications', 'Password resets, lockouts — recommended', prefs.categoryPrefs.security, (v) => updateCategory('security', v))}
          {renderRow('System notifications', 'Administrator messages', prefs.categoryPrefs.system, (v) => updateCategory('system', v))}

          <TouchableOpacity style={styles.btnOutline} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#4F46E5" size="small" />
            ) : (
              <>
                <Feather name="save" size={16} color="#4F46E5" />
                <Text style={styles.btnOutlineText}>Save Preferences</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  loaderWrap: {
    padding: 32,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.bg.secondary,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
    paddingRight: 16,
  },
  content: {
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowTextWrap: {
    flex: 1,
    paddingRight: 16,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 11,
    color: colors.text.muted,
  },
  sectionDivider: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.bg.tertiary,
  },
  sectionDividerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.bg.primary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#4F46E5', // Purple matching screenshot
  },
  toggleBtnInactive: {
    backgroundColor: colors.bg.secondary,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
  },
  toggleTextActive: {
    color: '#FFF',
  },
  toggleTextInactive: {
    color: colors.text.secondary,
  },
  btnOutline: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 16,
    marginLeft: 16,
    gap: 8,
  },
  btnOutlineText: {
    color: '#4F46E5',
    fontWeight: '500',
    fontSize: 13,
  }
});
