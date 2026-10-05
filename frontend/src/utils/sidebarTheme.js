/**
 * When a tenant picks their own sidebar background, every colour that was
 * tuned for the default dark navy needs to follow — text was `#9ca3af` light
 * grey (unreadable on a pale sidebar), hovers were `rgba(255,255,255,0.06)`
 * (invisible on a pale sidebar), the active chip was indigo (clashes with a
 * warm brand). This file flips all of them from a single input.
 *
 * The decision is luminance: anything brighter than mid-grey is treated as a
 * "light" sidebar and the text goes dark; anything darker keeps the stock
 * light text. The threshold matches the one in CompanyLoginLayout.inkOn so
 * sign-in and signed-in agree.
 */

/** Perceived brightness 0..255 using the ITU-R BT.601 coefficients. */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Light overlay on dark, dark overlay on light — never both. */
function overlay(onLight, alpha) {
  return onLight ? `rgba(0, 0, 0, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
}

/**
 * Compute the five sidebar CSS variables for a chosen background.
 * Returns an object the caller writes with element.style.setProperty.
 */
export function sidebarVarsFor(bgHex) {
  const bright = luminance(bgHex) > 170;
  const onLight = bright;
  return {
    '--nx-sidebar-bg':          bgHex,
    '--nx-sidebar-text':        onLight ? '#334155' : '#9ca3af',
    '--nx-sidebar-text-active': onLight ? '#0f172a' : '#ffffff',
    '--nx-sidebar-hover':       overlay(onLight, 0.06),
    '--nx-sidebar-active':      overlay(onLight, 0.12),
    '--nx-sidebar-border':      overlay(onLight, 0.08),
  };
}

/** Write (or clear) all five vars at once. */
export function applySidebarTheme(bgHex) {
  const root = document.documentElement;
  if (!bgHex) {
    for (const key of ['--nx-sidebar-bg', '--nx-sidebar-text', '--nx-sidebar-text-active',
                       '--nx-sidebar-hover', '--nx-sidebar-active', '--nx-sidebar-border']) {
      root.style.removeProperty(key);
    }
    return;
  }
  const vars = sidebarVarsFor(bgHex);
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
}
