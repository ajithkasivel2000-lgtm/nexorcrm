import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { Feather } from '@expo/vector-icons';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import TopBar from '../../components/TopBar';
import SelectField from '../../components/SelectField';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

/* Named once: the download writes this sheet and the upload looks for it. */
const SAMPLE_SHEET = 'Sample Leads';

const HELP_ITEMS = [
  ['Lead Import', 'This form is used for uploading the leads.'],
  ['Select Project', 'Project To Be Selected while importing the lead.'],
  ['Download Sample File', 'Download the sample file and add the values save as csv.'],
  ['Import lead', 'Import the csv file when all the fields of csv file is updated.'],
  ['Project Names', 'Select "lokations" as a project when you don\'t have any project to be assigned for the lead.'],
];

export default function ImportLeadsScreen({ navigation }) {
  const { colors } = useTheme();

  const [file, setFile]           = useState(null);   // { name, uri, isWorkbook }
  const [projectsList, setProjectsList] = useState([]);
  const [sourceLists, setSourceLists]   = useState({ primary: [], secondary: [], tertiary: [] });
  const [queueTypes, setQueueTypes]     = useState([]);
  const [queueType, setQueueType]       = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* Reference data — same endpoints the web page loads. */
  useEffect(() => {
    api.get('/projects')
      .then((res) => setProjectsList(Array.isArray(res.data) ? res.data : (res.data?.projects || [])))
      .catch(() => {});
    const loadSources = async (url) => {
      try {
        const res = await api.get(url);
        const data = res.data;
        return (Array.isArray(data) ? data : (data?.sources || data?.data || []))
          .map((r) => (typeof r === 'string' ? r : r.sourceName)).filter(Boolean);
      } catch { return []; }
    };
    Promise.all([
      loadSources('/primary-sources'),
      loadSources('/secondary-sources'),
      loadSources('/tertiary-sources'),
    ]).then(([primary, secondary, tertiary]) => setSourceLists({ primary, secondary, tertiary }));

    api.get('/rrq-types')
      .then((res) => {
        const types = Array.isArray(res.data) ? res.data.filter((t) => t?.typeName) : (res.data?.types || []);
        setQueueTypes(types);
        const presales = types.find((t) => t.typeName.toLowerCase() === 'presales');
        setQueueType((current) => current || presales?.typeName || types[0]?.typeName || '');
      })
      .catch(() => {});
  }, []);

  /* ---- sample file download (as CSV, shareable) ---- */
  const downloadSample = async () => {
    try {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const pick = (list, i, fallback) => list[i] || list[0] || fallback;
      const exampleProject = projectsList[0]?.id || 'PRJ-2026-001';

      const lines = [];
      lines.push('# How to fill in this file');
      lines.push('# 1. Keep the header row exactly as it is — columns are matched by name.');
      lines.push('# 2. Replace the example rows with your own; delete any you did not use.');
      lines.push('# 3. Leads name and phone number are required. Every other column may be left empty.');
      lines.push('# 4. Phone number: 10 digits. No spaces and no +91.');
      lines.push('# 5. Use a value from the reference lists below for the source and project columns.');
      lines.push('# 6. Leave project id empty to use the project selected on the import screen.');
      lines.push('');
      lines.push('# Available projects (name, id)');
      if (projectsList.length > 0) {
        projectsList.forEach((p) => lines.push(`# ${p.projectName}, ${p.id}`));
      } else {
        lines.push('# Vaighousing, PRJ-2026-001');
        lines.push('# BCD Royale, PRJ-2026-002');
      }
      lines.push('');
      lines.push('# Reference sources (primary, secondary, tertiary)');
      const rows = Math.max(sourceLists.primary.length, sourceLists.secondary.length, sourceLists.tertiary.length, 1);
      for (let i = 0; i < rows; i++) {
        lines.push(`# ${sourceLists.primary[i] || ''}, ${sourceLists.secondary[i] || ''}, ${sourceLists.tertiary[i] || ''}`);
      }
      lines.push('');
      lines.push(['Leads name', 'phone number', 'email id', 'primary source', 'secondary source', 'tertiary source', 'project id'].map(esc).join(','));
      lines.push([esc('Meera Krishnan'), esc('9865321470'), esc('meera.krishnan@example.com'),
        esc(pick(sourceLists.primary, 1, 'Channel partner')), esc(pick(sourceLists.secondary, 2, 'Event')),
        esc(pick(sourceLists.tertiary, 0, 'FB Ads')), esc(exampleProject)].join(','));
      lines.push([esc('Arjun Nair'), esc('9876543210'), esc('arjun.nair@example.com'),
        esc(pick(sourceLists.primary, 0, 'Digital Marketing')), esc(pick(sourceLists.secondary, 0, 'Website')), esc(''), esc('')].join(','));

      const csv = lines.join('\n');
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) {
        throw new Error('Cache directory unavailable on this device.');
      }
      const path = cacheDir + 'sample_leads.csv';
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Download sample file' });
      } else {
        Alert.alert('Sample file ready', `Saved to: ${path}`);
      }
    } catch (e) {
      console.error('Sample download failed', e);
      Alert.alert('Download failed', e?.message || 'Could not create the sample file.');
    }
  };

  /* ---- file pick ---- */
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.template'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const name = asset.name || 'import.xlsx';
      const isWorkbook = /\.(xlsx|xls)$/i.test(name);
      setFile({ name, uri: asset.uri, isWorkbook });
    } catch (e) {
      console.error('Pick failed', e);
    }
  };

  /* ---- parsing (web rules) ---- */
  const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else current += ch;
    }
    values.push(current.trim());
    return values;
  };

  const parseCSVText = (text) => {
    const lines = text.split(/\r\n|\n/).filter((line) => {
      const t = line.trim();
      return t !== '' && !t.startsWith('#');
    });
    if (lines.length <= 1) return [];
    const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]).map((v) => v.replace(/^"|"$/g, ''));
      const rowObj = {};
      headers.forEach((h, idx) => { rowObj[h] = values[idx] || ''; });
      rows.push(rowObj);
    }
    return rows;
  };

  const parseWorkbook = (base64) => {
    const book = XLSX.read(base64, { type: 'base64' });

    const looksLikeLeads = (name) => {
      const head = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, range: 0 })[0] || [];
      return head.some((h) => /leads?s*name|^name$/i.test(String(h || '').trim()));
    };

    const sheetName = book.SheetNames.includes(SAMPLE_SHEET)
      ? SAMPLE_SHEET
      : book.SheetNames.find(looksLikeLeads) || book.SheetNames[0];
    if (!sheetName) return [];

    return XLSX.utils.sheet_to_json(book.Sheets[sheetName], { defval: '', raw: false })
      .map((row) => {
        const clean = {};
        Object.entries(row).forEach(([key, value]) => {
          clean[String(key).trim()] = typeof value === 'string' ? value.trim() : value;
        });
        return clean;
      })
      .filter((row) => Object.values(row).some((v) => String(v || '').trim() !== ''));
  };

  /* Row mapping — same header aliases the backend accepts. */
  const mapRow = (row) => {
    const get = (...keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
        if (found && String(row[found] ?? '').trim() !== '') return String(row[found]).trim();
      }
      return '';
    };
    return {
      name: get('Leads name', 'name', 'Leads Name'),
      mobile: get('phone number', 'mobile', 'phone', 'Phone Number'),
      email: get('email id', 'email'),
      primarySource: get('primary source'),
      secondarySource: get('secondary source'),
      tertiarySource: get('tertiary source'),
      projectId: get('project id'),
    };
  };

  /* ---- submit ---- */
  const handleSubmit = async () => {
    if (!file || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let parsedRows = [];
      if (file.isWorkbook) {
        const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        parsedRows = parseWorkbook(b64);
      } else {
        const text = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
        parsedRows = parseCSVText(text);
      }

      const leads = parsedRows.map(mapRow).filter((r) => r.name && r.mobile);
      if (!leads.length) {
        Alert.alert('Nothing to import', 'No rows with a leads name and phone number were found in the file.');
        setIsSubmitting(false);
        return;
      }

      const response = await api.post('/leads/import', { queueType, leads });
      const result = response.data || {};
      const rejected = Array.isArray(result.skipped) ? result.skipped : [];
      const lines = rejected.slice(0, 10)
        .map((r) => `\u2022 ${r.name || '(no name)'}${r.mobile ? ` (${r.mobile})` : ''} — ${r.reason}`)
        .join('\n');
      const more = rejected.length > 10 ? `\n…and ${rejected.length - 10} more.` : '';

      Alert.alert(
        'Import result',
        `${result.message || 'Leads imported successfully!'}${rejected.length ? `\n\nNot imported:\n${lines}${more}` : ''}`,
        [{ text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'Leads' }) }]
      );
      setFile(null);
    } catch (err) {
      console.error('Lead import error:', err?.response?.data || err.message);
      Alert.alert('Import failed', err?.response?.data?.message || 'An error occurred while parsing or uploading the file.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const themed = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    titleBar: { paddingHorizontal: spacing.screenH, paddingTop: spacing.md, paddingBottom: spacing.sm },
    title: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
    body: { flex: 1, paddingHorizontal: spacing.screenH },
    card: {
      backgroundColor: colors.bg.secondary,
      borderRadius: spacing.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    cardTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
    cardSub: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 3, marginBottom: spacing.md },
    label: { color: colors.text.secondary, fontSize: typography.size.xs, fontWeight: '600', marginBottom: 6 },

    fileBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 8,
      backgroundColor: colors.bg.tertiary,
      height: 48,
      overflow: 'hidden',
    },
    chooseBtn: {
      backgroundColor: colors.bg.secondary,
      borderRightWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: 12,
      justifyContent: 'center',
      height: '100%',
    },
    chooseText: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '600' },
    fileName: { flex: 1, color: colors.text.muted, fontSize: typography.size.xs, paddingHorizontal: 10 },
    noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, gap: 4 },
    noteText: { color: colors.text.muted, fontSize: typography.size.xs },
    downloadLink: { color: colors.brand.light, fontSize: typography.size.xs, fontWeight: '600' },
    submitBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      alignSelf: 'center',
      minWidth: 120,
      marginTop: spacing.lg,
    },
    submitText: { color: '#fff', fontWeight: '700', fontSize: typography.size.sm },
    divider: { height: 1, backgroundColor: colors.border.subtle, marginTop: spacing.lg },
    helpItem: { marginBottom: spacing.md },
    helpTerm: { color: colors.text.primary, fontSize: typography.size.xs, fontWeight: '700' },
    helpDef: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2, lineHeight: 15 },

  });

  return (
    <View style={themed.root}>
      <TopBar onOpenDrawer={() => navigation.openDrawer()} />

      <View style={themed.titleBar}>
        <Text style={themed.title}>Import Leads</Text>
      </View>

      <ScrollView style={themed.body} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Import Now card */}
        <View style={themed.card}>
          <Text style={themed.cardTitle}>Import Now</Text>
          <Text style={themed.cardSub}>Import Leads - Leads can be imported from an Excel or CSV file here.</Text>

          <SelectField
            label="Queue Type:"
            value={queueType}
            options={queueTypes.map((t) => t.typeName).filter(Boolean)}
            onSelect={setQueueType}
            placeholder="Loading…"
            disabled={!queueTypes.length}
          />

          <Text style={themed.label}>Select File:</Text>
          <TouchableOpacity style={themed.fileBox} onPress={pickFile} activeOpacity={0.75}>
            <View style={themed.chooseBtn}>
              <Text style={themed.chooseText}>Choose File</Text>
            </View>
            <Text style={themed.fileName} numberOfLines={1}>
              {file ? file.name : 'No file chosen'}
            </Text>
            {file ? (
              <TouchableOpacity onPress={() => setFile(null)} style={{ paddingHorizontal: 10 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={15} color={colors.text.muted} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

          <View style={themed.noteRow}>
            <Text style={themed.noteText}>Excel (.xlsx) and .csv files are accepted | </Text>
            <TouchableOpacity onPress={downloadSample}>
              <Text style={themed.downloadLink}>Download A Sample File Here → ⬇</Text>
            </TouchableOpacity>
          </View>

          <View style={themed.divider} />

          <TouchableOpacity
            style={[themed.submitBtn, (!file || isSubmitting) && { opacity: 0.5 }]}
            disabled={!file || isSubmitting}
            onPress={handleSubmit}
          >
            {isSubmitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={themed.submitText}>Submit</Text>}
          </TouchableOpacity>
        </View>

        {/* Need Help? card */}
        <View style={themed.card}>
          <Text style={themed.cardTitle}>Need Help ?</Text>
          <View style={{ marginTop: spacing.md }}>
            {HELP_ITEMS.map(([term, def]) => (
              <View key={term} style={themed.helpItem}>
                <Text style={themed.helpTerm}>{term} -</Text>
                <Text style={themed.helpDef}>{def}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

    </View>
  );
}
