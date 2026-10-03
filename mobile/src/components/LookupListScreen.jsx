import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import api from '../services/api';

/**
 * Reusable LookupListScreen for managing basic dropdown lists.
 */
export default function LookupListScreen({ 
  title, 
  apiPath, 
  idField = 'id', 
  nameField = 'name' 
}) {
  const { colors } = useTheme();
  
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get(apiPath);
      setItems(res.data || []);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load list data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [apiPath]);

  const openCreate = () => {
    setEditItem(null);
    setInputValue('');
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setInputValue(item[nameField] || '');
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!inputValue.trim()) {
      Alert.alert('Validation Error', 'Value cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`${apiPath}/${editItem[idField]}`, { [nameField]: inputValue });
      } else {
        await api.post(apiPath, { [nameField]: inputValue });
      }
      setFormOpen(false);
      fetchItems();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', e?.response?.data?.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item) => {
    Alert.alert('Confirm Delete', `Are you sure you want to delete "${item[nameField]}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`${apiPath}/${item[idField]}`);
            fetchItems();
          } catch (e) {
            Alert.alert('Error', 'Failed to delete item.');
          }
        }
      }
    ]);
  };

  const themed = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      backgroundColor: colors.bg.secondary,
      borderBottomWidth: 1, borderBottomColor: colors.border.default,
    },
    title: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
    listContent: { padding: spacing.md },
    itemRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.default,
      borderRadius: 8, padding: 16, marginBottom: 8,
    },
    itemName: { color: colors.text.primary, fontSize: typography.size.base, fontWeight: '500' },
    actions: { flexDirection: 'row', gap: 12 },
    
    // FAB styles
    fab: {
      position: 'absolute', bottom: 24, right: 24,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: colors.brand.primary,
      alignItems: 'center', justifyContent: 'center',
      elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25, shadowRadius: 8,
    },

    // Modal styles
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg.secondary,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: spacing.lg, paddingBottom: spacing.xxl,
    },
    sheetHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    sheetTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
    input: {
      borderWidth: 1, borderColor: colors.border.default, borderRadius: 8,
      backgroundColor: colors.bg.tertiary, paddingHorizontal: 12,
      color: colors.text.primary, height: 48, fontSize: typography.size.base,
      marginBottom: spacing.lg,
    },
    submitBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 8,
      height: 48, alignItems: 'center', justifyContent: 'center',
    },
    submitText: { color: '#fff', fontSize: typography.size.base, fontWeight: '600' },
  });

  return (
    <View style={themed.root}>
      {/* Basic fallback header, though usually a Drawer header is used */}
      <View style={themed.header}>
        <Text style={themed.title}>{title}</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.brand.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={themed.listContent}>
          {items.map((item) => (
            <View key={item[idField]} style={themed.itemRow}>
              <Text style={themed.itemName}>{item[nameField]}</Text>
              <View style={themed.actions}>
                <TouchableOpacity onPress={() => openEdit(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="edit-2" size={16} color={colors.text.secondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="trash-2" size={16} color={colors.accent.red} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {items.length === 0 && (
            <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 40 }}>
              No items found.
            </Text>
          )}
        </ScrollView>
      )}

      {/* FAB to Add New Item */}
      <TouchableOpacity style={themed.fab} activeOpacity={0.8} onPress={openCreate}>
        <Feather name="plus" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* Add / Edit Form Modal */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <TouchableOpacity style={themed.backdrop} activeOpacity={1} onPress={() => setFormOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={themed.sheet}>
            <View style={themed.sheetHead}>
              <Text style={themed.sheetTitle}>{editItem ? `Edit ${title}` : `Add ${title}`}</Text>
              <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TextInput
                style={themed.input}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={`Enter ${title.toLowerCase()}`}
                placeholderTextColor={colors.text.muted}
                autoFocus
              />
              <TouchableOpacity style={themed.submitBtn} onPress={submitForm} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={themed.submitText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}
