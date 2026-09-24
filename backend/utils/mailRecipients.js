/**
 * The standing CC and BCC from Mail Settings.
 *
 * The two fields have always been editable and saved, and nothing read them —
 * so anyone who set a CC expecting copies quietly got none. This turns them
 * into what the screen implies.
 *
 * Three rules, all about not sending the same person the same message twice:
 *
 *   1. An address that is already the recipient is dropped. Copying someone on
 *      their own email is noise.
 *   2. An address in both CC and BCC is kept only in CC — otherwise the mail
 *      server is given the same recipient twice and delivers two copies.
 *   3. Anything that is not a valid address is skipped rather than failing the
 *      send. A stray comma should not stop a lead notification going out.
 */
const { isValidEmail } = require('./email');

/** Splits a stored "a@b.com, c@d.com" field into addresses. */
function parseList(value) {
  return String(value || '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Works out who else should be copied on a message.
 *
 * @param {object} mailSettings  the MailSetting row
 * @param {string|string[]} to   the main recipient(s), excluded from both lists
 * @returns {{cc: string[], bcc: string[], skipped: string[]}}
 */
function copyRecipients(mailSettings, to) {
  const taken = new Set(
    [].concat(to || []).filter(Boolean).map((a) => String(a).trim().toLowerCase()),
  );
  const skipped = [];

  const take = (value) => {
    const out = [];
    for (const address of parseList(value)) {
      const key = address.toLowerCase();
      if (taken.has(key)) continue;          // already getting this message
      if (!isValidEmail(address)) { skipped.push(address); continue; }
      taken.add(key);
      out.push(address);
    }
    return out;
  };

  // CC first, so an address in both lists is copied visibly rather than twice.
  const cc = take(mailSettings?.defaultCC);
  const bcc = take(mailSettings?.defaultBCC);

  return { cc, bcc, skipped };
}

/**
 * The cc/bcc fields to spread into a nodemailer message.
 *
 * Empty lists are left out entirely — passing `cc: []` is harmless but shows
 * up in logs as if someone was copied.
 */
function copyFields(mailSettings, to) {
  const { cc, bcc, skipped } = copyRecipients(mailSettings, to);
  const fields = {};
  if (cc.length) fields.cc = cc.join(', ');
  if (bcc.length) fields.bcc = bcc.join(', ');
  return { fields, cc, bcc, skipped };
}

/** "cc: a@b.com; bcc: 1 hidden" — for the lead log, without leaking the BCC. */
function describeCopies(cc, bcc) {
  const parts = [];
  if (cc.length) parts.push(`cc ${cc.join(', ')}`);
  // A BCC is blind to the recipients; the count is enough for the record.
  if (bcc.length) parts.push(`bcc ${bcc.length} hidden`);
  return parts.length ? ` (${parts.join('; ')})` : '';
}

module.exports = { copyRecipients, copyFields, describeCopies, parseList };
