import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Switch, Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

const CSV_PATH = (name) => `${FileSystem.cacheDirectory}${name}-${new Date().toISOString().slice(0, 10)}.csv`;

/** Escape a CSV field — quote everything, double embedded quotes. */
const esc = (text) => `"${String(text).replace(/"/g, '""')}"`;

/**
 * Filter / Export / Columns — the mobile twin of the web DataTable toolbar.
 *
 * - Filter: dropdown-style sheets per field; options derive from the rows
 *   exactly as the web derives them, with an "All …" clear option.
 * - Export: CSV of exactly what is on screen (rows already tabbed/filtered/
 *   searched, visible columns only) via the Android/iOS share sheet.
 * - Columns: show/hide columns; hidden ones drop out of rows and exports.
 */
export default function ListToolbar({ fields = [], rows = [], visibleColumns = [], hidden, onToggleColumn, onFiltered, exportName = 'export' }) {
  const { colors } = useTheme();
  const [sheet, setSheet] = useState(null);   // 'filter' | 'columns' | null
  const [activeField, setActiveField] = useState(null);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  /* Filter options derived from rows, like web: unique, sorted. */
  const filterFields = useMemo(() => fields.map((f) => {
    const getValue = f.getValue || ((row) => row[f.key]);
    const options = f.options || [...new Set(
      rows.map(getValue).filter((v) => v !== null && v !== undefined && v !== '')
    )].map(String).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { ...f, getValue, options, placeholder: f.placeholder || `All ${f.label}` };
  }), [fields, rows]);

  const runFilter = (next) => {
    setValues(next);
    const active = Object.entries(next).filter(([, v]) => v);
    if (!active.length) return onFiltered(rows);
    onFiltered(rows.filter((row) => active.every(([key, v]) => {
      const field = filterFields.find((f) => f.key === key);
      return String((field?.getValue || ((r) => r[key]))(row) || '') === String(v);
    })));
  };

  const exportCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const cols = visibleColumns;
      const header = [esc('SL.NO'), ...cols.map((c) => esc(c.label))].join(',');
      const body = rows.map((row, i) => [
        esc(String(i + 1)),
        ...cols.map((c) => esc(c.exportValue ? c.exportValue(row) : (row[c.key] ?? ''))),
      ].join(',')).join('\n');
      const csv = '\uFEFF' + header + '\n' + body;

      const path = CSV_PATH(exportName);
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export CSV' });
      }
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setBusy(false);
    }
  };

  const themed = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    btn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 7,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.secondary,
    },
    btnText: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600' },
    badge: {
      minWidth: 15, height: 15, borderRadius: 8,
      backgroundColor: colors.brand.primary,
      alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 3,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg.secondary,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '80%', paddingBottom: 24,
    },
    sheetHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm,
    },
    sheetTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
    sheetBody: { paddingHorizontal: spacing.lg },
    fieldRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
    },
    fieldLabel: { color: colors.text.primary, fontSize: typography.size.sm },
    optRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
    },
    optText: { color: colors.text.primary, fontSize: typography.size.sm, flex: 1 },
    clearBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
      backgroundColor: colors.bg.tertiary, marginBottom: spacing.sm,
    },
    clearText: { color: colors.brand.light, fontSize: typography.size.xs, fontWeight: '600' },
  });

  const Btn = ({ icon, label, onPress, badge }) => (
    <TouchableOpacity style={themed.btn} onPress={onPress} activeOpacity={0.75}>
      <Feather name={icon} size={13} color={colors.text.primary} />
      <Text style={themed.btnText}>{label}</Text>
      {badge ? <View style={themed.badge}><Text style={themed.badgeText}>{badge}</Text></View> : null}
    </TouchableOpacity>
  );

  const activeCount = Object.values(values).filter(Boolean).length;

  return (
    <View>
      <View style={themed.row}>
        <Btn icon="sliders" label="Filter" badge={activeCount || null} onPress={() => setSheet('filter')} />
        <Btn icon="download" label={busy ? 'Exporting…' : 'Export'} onPress={exportCsv} />
        <Btn icon="columns" label="Columns" onPress={() => setSheet('columns')} />
      </View>

      {/* Filter sheet */}
      <Modal visible={sheet === 'filter'} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <TouchableOpacity style={themed.backdrop} activeOpacity={1} onPress={() => setSheet(null)}>
          <TouchableOpacity activeOpacity={1} style={themed.sheet} onPress={() => {}}>
            <View style={themed.sheetHead}>
              <Text style={themed.sheetTitle}>Filter</Text>
              <TouchableOpacity onPress={() => setSheet(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={themed.sheetBody}>
              {filterFields.map((field) => (
                <TouchableOpacity
                  key={field.key}
                  style={themed.fieldRow}
                  onPress={() => setActiveField(activeField?.key === field.key ? null : field)}
                >
                  <Text style={themed.fieldLabel}>{field.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: colors.text.muted, fontSize: typography.size.xs }} numberOfLines={1}>
                      {values[field.key] || field.placeholder}
                    </Text>
                    <Feather
                      name={activeField?.key === field.key ? 'chevron-up' : 'chevron-down'}
                      size={14} color={colors.text.muted}
                    />
                  </View>
                </TouchableOpacity>
              ))}
              {activeField ? (
                <>
                  <TouchableOpacity
                    style={[themed.clearBtn, { marginTop: spacing.md }]}
                    onPress={() => { const n = { ...values, [activeField.key]: '' }; runFilter(n); }}
                  >
                    <Text style={themed.clearText}>{activeField.placeholder}</Text>
                  </TouchableOpacity>
                  {activeField.options.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={themed.optRow}
                      onPress={() => { const n = { ...values, [activeField.key]: values[activeField.key] === opt ? '' : opt }; runFilter(n); setActiveField(null); }}
                    >
                      <Text style={[themed.optText, values[activeField.key] === opt && { color: colors.brand.primary, fontWeight: '600' }]}>
                        {opt}
                      </Text>
                      {values[activeField.key] === opt ? <Feather name="check" size={15} color={colors.brand.primary} /> : null}
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Columns sheet */}
      <Modal visible={sheet === 'columns'} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <TouchableOpacity style={themed.backdrop} activeOpacity={1} onPress={() => setSheet(null)}>
          <TouchableOpacity activeOpacity={1} style={themed.sheet} onPress={() => {}}>
            <View style={themed.sheetHead}>
              <Text style={themed.sheetTitle}>Columns</Text>
              <TouchableOpacity onPress={() => setSheet(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={themed.sheetBody}>
              {visibleColumns.map((col) => (
                <View key={col.key} style={themed.fieldRow}>
                  <Text style={themed.fieldLabel}>{col.label}</Text>
                  <Switch
                    value={!hidden.includes(col.key)}
                    onValueChange={() => onToggleColumn(col.key)}
                    trackColor={{ true: colors.brand.primary, false: colors.bg.tertiary }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
