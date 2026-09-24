import { useState, useEffect } from 'react';

import { Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ImportLeads.css';
import { Page, Select } from './ui';
import * as XLSX from 'xlsx';
import invalidateLeadCache from './utils/invalidateLeadCache';

/* Named once: the download writes this sheet and the upload looks for it, so
   the two cannot drift apart and leave the app unable to read its own
   template. */
const SAMPLE_SHEET = 'Sample Leads';

export default function ImportLeads() {

  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  /* The source masters, listed in the sample file so whoever fills it in types
     values the CRM already knows. Import writes these columns through as free
     text — nothing rejects an unknown source — so a typo becomes a new source
     that matches nothing in the filters, which is exactly what the reference
     list below the projects is there to prevent. */
  const [sourceLists, setSourceLists] = useState({ primary: [], secondary: [], tertiary: [] });
  /* Empty until the RRQ Type master has been read: the queue type is whatever
     that table holds, so there is no sensible value to guess before it
     arrives. The first type becomes the selection once it does. */
  const [queueTypes, setQueueTypes] = useState([]);
  const [queueType, setQueueType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjectsList(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Error fetching projects:', err);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    const fetchSources = async () => {
      const load = async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data) ? data.map((r) => r.sourceName).filter(Boolean) : [];
        } catch {
          // A missing reference list must not stop the sample downloading.
          return [];
        }
      };
      const [primary, secondary, tertiary] = await Promise.all([
        load('/api/primary-sources'),
        load('/api/secondary-sources'),
        load('/api/tertiary-sources'),
      ]);
      setSourceLists({ primary, secondary, tertiary });
    };
    fetchSources();
  }, []);

  useEffect(() => {
    const fetchQueueTypes = async () => {
      try {
        const res = await fetch('/api/rrq-types');
        if (!res.ok) return;
        const data = await res.json();
        const types = Array.isArray(data) ? data.filter((t) => t?.typeName) : [];
        setQueueTypes(types);
        /* Presales is the queue most imports go to and the one the form has
           always defaulted to, so it stays the default where it exists rather
           than being decided by the master's alphabetical order. */
        const presales = types.find((t) => t.typeName.toLowerCase() === 'presales');
        setQueueType((current) => current || presales?.typeName || types[0]?.typeName || '');
      } catch (err) {
        console.error('Error fetching queue types:', err);
      }
    };
    fetchQueueTypes();
  }, []);

  /**
   * The sample workbook: a Help sheet and a Sample Leads sheet.
   *
   * This used to be one CSV with the guidance carried on '#' comment lines.
   * The import read it correctly, but nobody imports a file without opening it
   * first — and Excel splits every line on its commas, so "10 digits, no
   * spaces, no +91" arrived spread across three columns, and the reference
   * lists broke apart the same way. A sheet per purpose keeps each instruction
   * in one cell, and puts the grid to fill in on its own tab.
   */
  const handleDownloadSample = (e) => {
    e.preventDefault();

    const help = [
      ['How to fill in this workbook'],
      [],
      ['1.', 'Fill in the "Sample Leads" tab. This tab is only for reference.'],
      ['2.', 'Keep its header row exactly as it is — columns are matched by name.'],
      ['3.', 'Replace the two example rows with your own, then delete any you did not use.'],
      ['4.', 'Leads name and phone number are required. Every other column may be left empty.'],
      ['5.', 'Phone number: 10 digits. No spaces and no +91.'],
      ['6.', 'Use a value from the lists below for the source and project columns.'],
      ['', 'Anything else is imported exactly as typed and will match none of your filters.'],
      ['7.', 'Leave project id empty to use the project selected on the import screen.'],
      [],
      ['Available projects'],
      ['Project name', 'Project id'],
      ...(projectsList.length > 0
        ? projectsList.map((prj) => [prj.projectName, prj.id])
        : [['Vaighousing', 'PRJ-2026-001'], ['BCD Royale', 'PRJ-2026-002']]),
      [],
      ['Primary source', 'Secondary source', 'Tertiary source'],
      /* The three lists side by side, one column each, so they read as the
         three separate choices they are rather than one long column. */
      ...Array.from(
        { length: Math.max(sourceLists.primary.length, sourceLists.secondary.length, sourceLists.tertiary.length, 1) },
        (_, i) => [sourceLists.primary[i] || '', sourceLists.secondary[i] || '', sourceLists.tertiary[i] || ''],
      ),
    ];

    const pick = (list, index, fallback) => list[index] || list[0] || fallback;
    const exampleProject = projectsList[0]?.id || 'PRJ-2026-001';

    const leads = [
      ['Leads name', 'phone number', 'email id', 'primary source', 'secondary source', 'tertiary source', 'project id'],
      ['Meera Krishnan', '9865321470', 'meera.krishnan@example.com',
        pick(sourceLists.primary, 1, 'Channel partner'),
        pick(sourceLists.secondary, 2, 'Event'),
        pick(sourceLists.tertiary, 0, 'FB Ads'),
        exampleProject],
      ['Arjun Nair', '9876543210', 'arjun.nair@example.com',
        pick(sourceLists.primary, 0, 'Digital Marketing'),
        pick(sourceLists.secondary, 0, 'Website'),
        '', ''],
    ];

    const helpSheet = XLSX.utils.aoa_to_sheet(help);
    helpSheet['!cols'] = [{ wch: 22 }, { wch: 60 }, { wch: 22 }];

    const leadsSheet = XLSX.utils.aoa_to_sheet(leads);
    leadsSheet['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];

    /* Phone numbers as text. Left as numbers, Excel shows 9865321470 as
       9.87E+09 and — worse — hands back the rounded value on save, so the
       number that imports is not the number that was typed. */
    leads.forEach((row, r) => {
      if (r === 0) return;
      const ref = XLSX.utils.encode_cell({ r, c: 1 });
      if (leadsSheet[ref]) { leadsSheet[ref].t = 's'; leadsSheet[ref].z = '@'; }
    });

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, helpSheet, 'Help');
    XLSX.utils.book_append_sheet(book, leadsSheet, SAMPLE_SHEET);
    XLSX.writeFile(book, 'sample_leads.xlsx');
  };
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    } else {
      setFile(null);
    }
  };

  /**
   * Rows out of the sample workbook.
   *
   * Reads the "Sample Leads" sheet by name, so the Help tab beside it is never
   * mistaken for data. A workbook saved from elsewhere may not use that name,
   * so the first sheet carrying a recognisable header is the fallback, and a
   * single-sheet file just uses its only sheet.
   */
  const parseWorkbook = (buffer) => {
    const book = XLSX.read(buffer, { type: 'array' });

    const looksLikeLeads = (name) => {
      const head = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, range: 0 })[0] || [];
      return head.some((h) => /leads?s*name|^name$/i.test(String(h || '').trim()));
    };

    const sheetName = book.SheetNames.includes(SAMPLE_SHEET)
      ? SAMPLE_SHEET
      : book.SheetNames.find(looksLikeLeads) || book.SheetNames[0];
    if (!sheetName) return [];

    /* raw:false so every cell arrives as the text it displays — a phone number
       typed into a fresh column is a number to Excel, and 9865321470 would
       otherwise reach the server as 9865321470 rounded through a float. */
    return XLSX.utils.sheet_to_json(book.Sheets[sheetName], { defval: '', raw: false })
      .map((row) => {
        const clean = {};
        Object.entries(row).forEach(([key, value]) => {
          clean[String(key).trim()] = typeof value === 'string' ? value.trim() : value;
        });
        return clean;
      })
      // A blank line left in the middle of the sheet is not a lead.
      .filter((row) => Object.values(row).some((v) => String(v || '').trim() !== ''));
  };

  // Parse a single CSV line respecting quoted fields (handles commas inside quotes)
  const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote inside quoted field
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    return values;
  };

  const parseCSV = (text) => {
    // Split lines, skip empty lines AND comment lines (starting with #)
    const lines = text.split(/\r\n|\n/).filter(line => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('#');
    });
    if (lines.length <= 1) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i];
      if (!currentLine.trim()) continue;

      const values = parseCSVLine(currentLine).map(v => v.replace(/^"|"$/g, ''));
      const rowObj = {};
      headers.forEach((h, index) => {
        rowObj[h] = values[index] || '';
      });
      rows.push(rowObj);
    }
    return rows;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) {
      window.appAlert('Please choose a CSV or Excel file to upload.');
      return;
    }

    setIsSubmitting(true);
    const isWorkbook = /.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsedRows = isWorkbook
          ? parseWorkbook(evt.target.result)
          : parseCSV(evt.target.result);

        if (parsedRows.length === 0) {
          window.appAlert(isWorkbook
            ? `No lead rows found. Fill in the "${SAMPLE_SHEET}" tab and try again.`
            : 'No valid lead records found in the CSV file.');
          setIsSubmitting(false);
          return;
        }

        const response = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queueType,
            leads: parsedRows
          })
        });

        if (response.ok) {
          const result = await response.json();
          /* Rows the server refused — a missing phone number, an address that
             is not an address. They used to be dropped silently, so a file of
             200 could import as 160 with nothing said about the other 40.
             Named here so the row can be corrected and re-imported. */
          const rejected = Array.isArray(result.skipped) ? result.skipped : [];
          if (rejected.length) {
            const lines = rejected.slice(0, 10)
              .map((r) => `• ${r.name || '(no name)'}${r.mobile ? ` (${r.mobile})` : ''} — ${r.reason}`)
              .join('\n');
            const more = rejected.length > 10 ? `\n…and ${rejected.length - 10} more.` : '';
            window.appAlert(`${result.message}\n\nNot imported:\n${lines}${more}`);
          } else {
            window.appAlert(result.message || 'Leads imported successfully!');
          }
          // The import created new leads / duplicates server-side, so refresh
          // every lead view (lists, tabs, counts, dashboard) without a reload.
          invalidateLeadCache();
          navigate('/leads');
        } else {
          const errData = await response.json();
          window.appAlert(errData.message || 'Failed to import leads.');
        }
      } catch (err) {
        console.error('Lead import error:', err);
        window.appAlert('An error occurred while parsing or uploading the file.');
      } finally {
        setIsSubmitting(false);
      }
    };
    // A workbook is binary; a CSV is text. Reading one as the other yields
    // rubbish rather than an error, so the choice is made from the file name.
    if (isWorkbook) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  return (
    <Page title="Import Leads">

      <div className="il-grid">
        {/* Form Card */}
        <div className="il-form-card">
          <h2 className="il-card-title">Import Now</h2>
          <p className="il-card-subtitle">Import Leads - Leads can be imported from an Excel or CSV file here</p>

          <form onSubmit={handleSubmit}>
            <div className="il-form-group">
              <label className="il-form-label">Queue Type:</label>
              <Select
                value={queueType}
                onChange={(e) => setQueueType(e.target.value)}
                disabled={queueTypes.length === 0}
                required
              >
                {/* The list is the RRQ Type master, so a type an administrator
                    adds appears here without a code change — and one that is
                    not in the master cannot be picked. The old hard-coded list
                    offered "Channel Partner", which had no queue behind it and
                    silently imported into Presales. */}
                {queueTypes.length === 0 && <option value="">Loading…</option>}
                {queueTypes.map((t) => (
                  <option key={t.id || t.typeName} value={t.typeName}>{t.typeName}</option>
                ))}
              </Select>
            </div>

            <div className="il-form-group">
              <label className="il-form-label">Select File:</label>
              <div className="il-file-upload-container">
                <button type="button" className="il-file-btn">Choose File</button>
                <span className="il-file-name">{file ? file.name : 'No file chosen'}</span>
                <input
                  type="file"
                  className="il-file-input"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  required
                />
              </div>
            </div>

            <div className="il-help-text">
              Excel (.xlsx) and .csv files are accepted | Download A Sample File Here -&gt;
              <span className="il-download-link" onClick={handleDownloadSample}>
                <Download size={14} />
              </span>
            </div>

            <hr className="il-divider" />

            <button type="submit" className="il-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Importing...' : 'Submit'}
            </button>
          </form>
        </div>

        {/* Help Card */}
        <div className="il-help-card">
          <h2 className="il-card-title">Need Help ?</h2>
          <ul className="il-help-list">
            <li className="il-help-item">
              <strong>Lead Import -</strong>This form is used for uploading the leads.
            </li>
            <li className="il-help-item">
              <strong>Select Project -</strong> Project To Be Selected while importing the lead .
            </li>
            <li className="il-help-item">
              <strong>Download Sample File -</strong> Download the sample file and add the values save as csv.
            </li>
            <li className="il-help-item">
              <strong>import lead -</strong> Import the csv file when all the fields of csv file is updated .
            </li>
            <li className="il-help-item">
              <strong>Project Names</strong> Select "lokations" as a project when you don't have any project to be assigned for the lead
            </li>
          </ul>
        </div>
      </div>
    </Page>
  );
}
