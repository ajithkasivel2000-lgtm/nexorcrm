/**
 * The customer's site-visit email, as a brochure rather than a line of text.
 *
 * Built as tables with inline styles on purpose. Outlook renders with Word,
 * Gmail strips <style> blocks, and neither supports flexbox or grid — so a
 * layout that looks right in a browser routinely collapses into a column of
 * unstyled text in the clients customers actually use. Tables, widths in
 * pixels, and one 600px shell is the format that survives all of them.
 *
 * Nothing here decides what a customer may see. It renders whatever
 * projectBrochure.customerProject() returns, and that function is the
 * whitelist — so this file cannot leak a field by adding a section.
 */

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escapeAttr = (v) => escapeHtml(v).replace(/`/g, '&#96;');

const C = {
  ink: '#1a1d29',
  body: '#454b5e',
  muted: '#79809a',
  line: '#e6e9f0',
  soft: '#f6f7fb',
  brand: '#4a52d9',
  accent: '#0f9b6c',
};

/** A label/value line in a details table. */
const pair = (label, value) => `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid ${C.line};color:${C.muted};font-size:13px;width:46%;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid ${C.line};color:${C.ink};font-size:13px;font-weight:600;vertical-align:top">${escapeHtml(value)}</td>
  </tr>`;

/** A section, only rendered when it has something in it. */
const section = (title, inner) => (inner ? `
  <tr><td style="padding:22px 28px 0">
    <p style="margin:0 0 10px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:${C.muted};font-weight:700">${escapeHtml(title)}</p>
    ${inner}
  </td></tr>` : '');

const table = (rows) => (rows.length
  ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
      ${rows.map(([k, v]) => pair(k, v)).join('')}
    </table>`
  : '');

/**
 * Amenities as wrapping chips.
 *
 * Each chip is its own inline-block cell rather than a flex child, because
 * Outlook ignores flex entirely and would stack forty amenities down the page.
 */
const chips = (items) => (items.length
  ? `<div style="line-height:2.1">${items.map((item) => `
      <span style="display:inline-block;padding:5px 11px;margin:0 6px 6px 0;background:${C.soft};border:1px solid ${C.line};border-radius:14px;font-size:12px;color:${C.body}">${escapeHtml(item)}</span>`).join('')}
    </div>`
  : '');

const bullets = (items) => (items.length
  ? `<ul style="margin:0;padding-left:18px;color:${C.body};font-size:13px;line-height:1.75">
      ${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}
    </ul>`
  : '');

/**
 * Chips for short entries, bullets for prose.
 *
 * These two fields are free text and arrive in both shapes: an amenity list is
 * a dozen short names, while a features block is often full sentences. Rendered
 * as chips, a sentence becomes a pill stretching the width of the email and the
 * section stops reading as a list at all — so the shape of the content decides
 * the shape of the markup.
 */
const listOrChips = (items) => {
  if (!items.length) return '';
  const longest = items.reduce((n, i) => Math.max(n, i.length), 0);
  return longest > 34 ? bullets(items) : chips(items);
};

/**
 * @param {string} event  scheduled | confirmed | rescheduled | reminder-24h | …
 * @param {object} f      the visit's customer-safe fields
 * @param {object|null} p the project brochure, or null for the plain message
 */
function customerEmailHtml(event, f, p) {
  const projectName = p?.name || f.projectName;

  const opening = {
    cancelled: `Your visit to <strong>${escapeHtml(projectName)}</strong> on ${escapeHtml(f.when)} has been cancelled. Do get in touch if you would like to arrange another time.`,
    rescheduled: `Your visit to <strong>${escapeHtml(projectName)}</strong> has moved${f.previousWhen ? ` from ${escapeHtml(f.previousWhen)}` : ''} to <strong>${escapeHtml(f.when)}</strong>.`,
    confirmed: `Your visit to <strong>${escapeHtml(projectName)}</strong> on <strong>${escapeHtml(f.when)}</strong> is confirmed.`,
    'reminder-24h': `A reminder that your visit to <strong>${escapeHtml(projectName)}</strong> is tomorrow, ${escapeHtml(f.when)}.`,
    'reminder-2h': `Your visit to <strong>${escapeHtml(projectName)}</strong> is in about 2 hours — ${escapeHtml(f.when)}.`,
  }[event] || `Your visit to <strong>${escapeHtml(projectName)}</strong> is booked for <strong>${escapeHtml(f.when)}</strong>.`;

  /* A cancelled visit gets the message and nothing else. Sending a brochure
     for something that is not happening reads as a mistake. */
  const cancelled = event === 'cancelled';

  const visitRows = [
    ['When', f.when],
    f.hostName ? ['You will be met by', f.hostName] : null,
    ['Address', p?.address || f.projectAddress],
    f.projectContact || p?.contact ? ['Contact', f.projectContact || p.contact] : null,
  ].filter((r) => r && r[1]);

  const priceRows = p ? [
    p.priceBand ? ['Price', p.priceBand] : null,
    p.pricePerSqft ? ['Rate', `${p.pricePerSqft} per sq.ft`] : null,
    ...(p.charges || []),
  ].filter(Boolean) : [];

  const mapLink = f.projectMapLink || p?.mapLink;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(projectName)}</title></head>
<body style="margin:0;padding:0;background:#eef0f6">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef0f6;padding:24px 12px">
<tr><td align="center">

<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">

  <!-- Masthead -->
  <tr><td style="background:${C.brand};padding:26px 28px">
    <p style="margin:0;color:#ffffff;font-size:21px;font-weight:700">${escapeHtml(projectName)}</p>
    ${p?.tagline ? `<p style="margin:5px 0 0;color:#d8daf8;font-size:13px">${escapeHtml(p.tagline)}</p>` : ''}
  </td></tr>

  <!-- The message -->
  <tr><td style="padding:24px 28px 0">
    <p style="margin:0 0 10px;color:${C.ink};font-size:15px">Hello ${escapeHtml(f.customerName)},</p>
    <p style="margin:0;color:${C.body};font-size:14px;line-height:1.65">${opening}</p>
  </td></tr>

  <!-- The visit itself, first: it is why the email was sent -->
  <tr><td style="padding:18px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${C.soft};border:1px solid ${C.line};border-radius:10px">
      <tr><td style="padding:16px 18px">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:${C.accent};font-weight:700">Your visit</p>
        ${table(visitRows)}
        ${mapLink ? `<p style="margin:14px 0 0">
          <a href="${escapeAttr(mapLink)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:13px;font-weight:600">Get directions</a>
        </p>` : ''}
        ${f.note ? `<p style="margin:12px 0 0;color:${C.body};font-size:13px;line-height:1.6">${escapeHtml(f.note)}</p>` : ''}
      </td></tr>
    </table>
  </td></tr>

  ${cancelled || !p ? '' : `
  ${p.summary ? `<tr><td style="padding:22px 28px 0">
    <p style="margin:0;color:${C.body};font-size:14px;line-height:1.7">${escapeHtml(p.summary)}</p>
  </td></tr>` : ''}

  ${p.usp ? `<tr><td style="padding:16px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="border-left:3px solid ${C.brand};padding:2px 0 2px 13px;color:${C.ink};font-size:14px;font-style:italic">${escapeHtml(p.usp)}</td></tr>
    </table>
  </td></tr>` : ''}

  ${section('Highlights', bullets(p.highlights))}
  ${section('Pricing', table(priceRows))}
  ${section('Configuration', table(p.configuration))}
  ${section('Amenities', listOrChips(p.amenities))}
  ${section('Features', listOrChips(p.features))}
  ${section('Project status', table(p.status))}
  ${section('About', table([
    p.builder ? ['Developer', p.builder] : null,
    p.rera ? ['RERA number', p.rera] : null,
    p.reraDate ? ['RERA registered', p.reraDate] : null,
  ].filter(Boolean)))}

  ${p.website ? `<tr><td style="padding:20px 28px 0" align="center">
    <a href="${escapeAttr(p.website)}" style="display:inline-block;border:1px solid ${C.brand};color:${C.brand};text-decoration:none;padding:10px 22px;border-radius:7px;font-size:13px;font-weight:600">View the project online</a>
  </td></tr>` : ''}
  `}

  <tr><td style="padding:24px 28px 28px">
    <p style="margin:0;color:${C.body};font-size:14px">We look forward to seeing you.</p>
    ${p?.contact || p?.email ? `<p style="margin:10px 0 0;color:${C.muted};font-size:12px">
      Questions before you come? ${p.contact ? escapeHtml(p.contact) : ''}${p.contact && p.email ? ' · ' : ''}${p.email ? escapeHtml(p.email) : ''}
    </p>` : ''}
  </td></tr>

  <tr><td style="background:${C.soft};border-top:1px solid ${C.line};padding:14px 28px">
    <p style="margin:0;color:${C.muted};font-size:11px;line-height:1.6">
      Prices, charges and specifications are indicative and subject to change.${p?.rera ? ` RERA ${escapeHtml(p.rera)}.` : ''}
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

module.exports = { customerEmailHtml, escapeHtml, escapeAttr };
