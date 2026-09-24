/**
 * The View (eye) button on an Leads row downloads the full Leads as a
 * document, in the style of a resume: a header with the person's name and the
 * key facts, then labelled sections of fields.
 *
 * jsPDF is the same library the table exports use, loaded on demand so it
 * stays out of the main bundle.
 */
import formatMobile from './formatMobile';
import loadPdfTools from './loadPdfTools';

/** Field groups, in the order they should appear on the document. */
const SECTIONS = [
  {
    title: 'Contact Information',
    fields: [
      ['mobile', 'Mobile Number', v => formatMobile(v)],
      ['mobileCountryCode', 'Country Code'],
      ['email', 'Email'],
      ['alternateNo', 'Alternate Number'],
      ['alternateEmail', 'Alternate Email'],
    ],
  },
  {
    title: 'Leads Details',
    fields: [
      ['status', 'Status'],
      ['primarySource', 'Primary Source'],
      ['secondarySource', 'Secondary Source'],
      ['tertiarySource', 'Tertiary Source'],
      ['channelPartnerName', 'Channel Partner'],
      ['channelPartnerId', 'Channel Partner ID'],
      ['project', 'Project Interested'],
      ['rating', 'Rating'],
      ['sourceUrl', 'Source URL'],
      ['referrerDetails', 'Referrer Details'],
    ],
  },
  {
    title: 'About the Customer',
    fields: [
      ['companyName', 'Company Name'],
      ['occupation', 'Occupation'],
      ['budgetLimit', 'Budget Limit'],
      ['euid', 'EUID'],
    ],
  },
  {
    title: 'Ownership',
    fields: [
      ['ownerName', 'Owner', (v, lead) => v || lead.owner || ''],
      ['allocator', 'Allocator'],
      ['allocatedDate', 'Allocated Date', formatDate],
      ['createdAt', 'Leads Received', formatDate],
      ['updatedAt', 'Last Updated', formatDate],
    ],
  },
  {
    title: 'Call & Follow-up',
    fields: [
      ['openReason', 'Open Reason'],
      ['callStatus', 'Call Status'],
      ['callRemarks', 'Call Remarks'],
      ['followUpDate', 'Follow Up Date', formatDate],
    ],
  },
  {
    title: 'Site Visit',
    fields: [
      ['siteVisitStatus', 'Site Visit Status'],
      ['siteVisitDate', 'Scheduled Date', formatDate],
      ['siteVisitNote', 'Scheduled Note'],
      ['siteVisitConfirmedDate', 'Confirmed Date', formatDate],
      ['siteVisitConfirmedNote', 'Confirmed Note'],
      ['siteVisitDoneDate', 'Completed Date', formatDate],
      ['siteVisitDoneNote', 'Completed Note'],
    ],
  },
  {
    title: 'Notes',
    fields: [
      ['rejectionType', 'Rejection Type'],
      ['reasonDetails', 'Rejection Reason'],
      ['invalidReason', 'Invalid Reason'],
      ['competitorName', 'Competitor Name'],
      ['competitorOffer', 'Competitor Offer'],
      ['otherNotes', 'Other Notes'],
      ['additionalRemarks', 'Additional Remarks'],
      ['virtualVisit', 'Virtual Visit'],
      ['virtualVisitDate', 'Virtual Visit Date', formatDate],
    ],
  },
];

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).replace(',', '');
}

/** Every section, with only the fields that actually have a value. */
function collectSections(lead) {
  return SECTIONS
    .map(({ title, fields }) => ({
      title,
      rows: fields
        .map(([key, label, format]) => {
          const raw = typeof format === 'function' ? format(lead[key], lead) : lead[key];
          const value = raw === null || raw === undefined || raw === '' ? '' : String(raw).trim();
          return value ? { label, value } : null;
        })
        .filter(Boolean),
    }))
    .filter(section => section.rows.length > 0);
}

/** Fetch the full record — the row in the table may hide fields. */
async function fetchLead(id) {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error(`Could not load the Leads (${res.status}).`);
  return res.json();
}

/**
 * Builds "Leads-<name>-<date>.pdf", laid out like a resume.
 *
 * Building is kept separate from what happens next, so the same document can
 * be shown on screen or saved without drawing it twice.
 *
 * @returns {Promise<{doc: object, filename: string}>}
 */
async function buildLeadsDocument(leadOrId) {
  // Accept either the row object or just its id. A bare id is fetched, since
  // only the record endpoint carries every field and the activity log.
  const data = typeof leadOrId === 'object' ? leadOrId : await fetchLead(leadOrId);

  const { jsPDF, autoTable } = await loadPdfTools();

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;

  /* ---- Header (the "resume" band) ------------------------------------- */
  const name = data.name || 'Leads';
  const status = data.status || '';

  doc.setFillColor(79, 70, 229); // the same indigo the table exports use
  doc.rect(0, 0, pageWidth, 92, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(name, marginX, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const taglineParts = [
    data.euid || data.id,
    status,
    data.primarySource || '',
  ].filter(Boolean);
  doc.text(taglineParts.join('  ·  '), marginX, 62);
  doc.text(`Leads Document  ·  ${formatDate(new Date())}`, marginX, 78);
  doc.setTextColor(0, 0, 0);

  /* ---- Sections --------------------------------------------------------- */
  const sections = collectSections(data);

  autoTable(doc, {
    // Below the header band, with a little breathing room.
    startY: 124,
    margin: { left: marginX, right: marginX },
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: { top: 4, bottom: 4, left: 0, right: 8 }, textColor: [30, 30, 30] },
    columnStyles: {
      0: { cellWidth: 150, fontStyle: 'bold', textColor: [80, 80, 90] },
      1: { cellWidth: 'auto' },
    },
    // Each section is its own table so its heading can sit above it.
    head: [],
    body: sections.flatMap(({ title, rows }) => {
      // Reserve the heading: autoTable paginates on its own, so emit the
      // heading as a full-width row that spans both columns.
      return [
        [{
          content: title.toUpperCase(),
          colSpan: 2,
          styles: {
            fontSize: 10.5,
            fontStyle: 'bold',
            textColor: [79, 70, 229],
            // The rule above each heading separates sections at a glance.
            borderTop: '1px solid #e2e2e8',
            paddingTop: 12,
          },
        }],
        ...rows.map(({ label, value }) => [label, value]),
      ];
    }),
  });

  /* ---- Activity log (latest first), if the record carries one ---------- */
  const logs = Array.isArray(data.logs) ? [...data.logs]
    .sort((a, b) => new Date(b.date) - new Date(a.date)) : [];

  // autoTable reports where its table ended, on whatever page that was.
  let cursorY = doc.lastAutoTable?.finalY || 0;

  if (logs.length > 0) {
    if (cursorY > doc.internal.pageSize.getHeight() - 160) {
      doc.addPage();
      cursorY = 60;
    } else {
      cursorY += 28;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229);
    doc.text('ACTIVITY LOG', marginX, cursorY);
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: cursorY + 12,
      margin: { left: marginX, right: marginX },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 0, right: 8 } },
      columnStyles: {
        0: { cellWidth: 130, textColor: [110, 110, 120] },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { cellWidth: 'auto', textColor: [90, 90, 100] },
      },
      head: [],
      body: logs.map(log => [
        formatDate(log.date),
        log.title || '',
        (log.subtitle || '').replace('by admin ', 'by '),
      ]),
    });
  }

  /* ---- Name it ----------------------------------------------------------- */
  const safeName = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Leads';
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `Leads-${safeName}-${stamp}.pdf`;

  return { doc, filename };
}

/** Builds the document and saves it straight away. */
export async function downloadLeadsDocument(leadOrId) {
  const { doc, filename } = await buildLeadsDocument(leadOrId);
  doc.save(filename);
  return filename;
}

/**
 * Builds the document and hands back a URL to show it with.
 *
 * The caller must call `release()` when the preview closes: a blob URL keeps
 * its data alive until it is revoked, so opening a few enquiries without it
 * would quietly hold every one of those documents in memory.
 *
 * @returns {Promise<{url: string, filename: string, save: Function, release: Function}>}
 */
export async function previewLeadsDocument(leadOrId) {
  const { doc, filename } = await buildLeadsDocument(leadOrId);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  return {
    url,
    filename,
    save: () => doc.save(filename),
    release: () => URL.revokeObjectURL(url),
  };
}

export default previewLeadsDocument;
