/**
 * Whether an email address can actually receive mail.
 *
 * Syntax validation is not enough, and this project has the scars: two user
 * accounts were saved with `kumar@gmailc.om` and `ajithkasivel2000@gma1il.com`.
 * Both are perfectly well-formed, so every check passed, and every lead
 * notification sent to them was accepted by the SMTP server and then either
 * bounced or — worse — was delivered to whoever owns the lookalike domain.
 *
 * Two checks, with very different confidence:
 *
 *   1. Does the domain have a mail server at all? A domain with no MX record
 *      cannot receive mail, full stop. That is a fact, not a guess, so it is
 *      worth refusing the save over.
 *
 *   2. Is the domain one character away from a common provider? That is a
 *      guess — a real domain can look like a typo — so it only ever produces
 *      a warning for a person to judge.
 */
const dns = require('dns').promises;

/** The providers nearly every mistyped address is aiming at. */
const COMMON_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com',
  'hotmail.com', 'live.com', 'icloud.com', 'protonmail.com', 'rediffmail.com',
  'aol.com', 'zoho.com', 'msn.com',
];

/** The domain part, lowercased, or '' when there isn't one. */
function domainOf(email) {
  const at = String(email || '').lastIndexOf('@');
  return at === -1 ? '' : String(email).slice(at + 1).trim().toLowerCase();
}

/** Edit distance, capped — anything past `max` is "not close" and we stop. */
function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (current[j] < best) best = current[j];
    }
    if (best > max) return max + 1;   // no better result is possible
    previous = current;
  }
  return previous[b.length];
}

/**
 * A likely intended domain, when the one given is a near-miss for a common
 * provider. Returns null for an exact match or anything not close.
 */
function suggestDomain(email) {
  const domain = domainOf(email);
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;

  for (const candidate of COMMON_DOMAINS) {
    if (editDistance(domain, candidate) <= 2) return candidate;
  }
  return null;
}

/** The same address with its domain corrected to `to`. */
function withDomain(email, to) {
  const at = String(email).lastIndexOf('@');
  return at === -1 ? email : `${String(email).slice(0, at)}@${to}`;
}

/**
 * Checks an address against DNS and against the common-typo list.
 *
 * Fails open on anything other than a definitive "this domain has no mail
 * server": a DNS timeout is a problem with the network, not with the address,
 * and must not stop someone saving a user.
 *
 * @returns {Promise<{ok: boolean, error?: string, warning?: string}>}
 */
async function checkDeliverable(email) {
  const domain = domainOf(email);
  if (!domain) return { ok: true };

  const suggestion = suggestDomain(email);

  let mx = null;
  try {
    mx = await dns.resolveMx(domain);
  } catch (error) {
    // NXDOMAIN: no such domain. ENODATA: the domain exists but has no MX.
    // Either way mail to it cannot be delivered.
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA' || error.code === 'NXDOMAIN') {
      const hint = suggestion ? ` Did you mean ${withDomain(email, suggestion)}?` : '';
      return {
        ok: false,
        error: `"${email}" cannot receive mail — the domain ${domain} has no mail server.${hint}`,
      };
    }
    return { ok: true };   // DNS itself is unreachable; not the address's fault
  }

  if (!mx || mx.length === 0) {
    const hint = suggestion ? ` Did you mean ${withDomain(email, suggestion)}?` : '';
    return {
      ok: false,
      error: `"${email}" cannot receive mail — the domain ${domain} has no mail server.${hint}`,
    };
  }

  // The domain works, but it still looks like a near-miss. Saying so is all
  // that is warranted: someone may genuinely use it.
  if (suggestion) {
    return {
      ok: true,
      warning: `${domain} looks like a typo. Did you mean ${withDomain(email, suggestion)}?`,
    };
  }

  return { ok: true };
}

module.exports = { checkDeliverable, suggestDomain, domainOf, withDomain, COMMON_DOMAINS };
