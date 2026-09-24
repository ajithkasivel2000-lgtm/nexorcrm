/**
 * Enter moves to the next field.
 *
 * Data entry here is long: a lead, a project, a user record are twenty or
 * thirty fields each, typed straight through. Enter used to end the field and
 * stop, so every single one needed a reach for Tab or the mouse between them.
 * Enter now does what it does in a spreadsheet — commit and step forward —
 * and Tab still works exactly as it did.
 *
 * This is the one place that decides what "the next field" means, so the
 * record pages, the settings screens and the modals all agree.
 *
 * It only moves focus. Whether anything is *saved* first is the caller's
 * business: RecordField commits the field before calling this, a page with its
 * own Save button saves nothing until that button is pressed.
 */

/* Fields, not every focusable thing. Ordinary buttons and links are
   deliberately out: Enter is how you press a button, so landing on one would
   mean the next Enter fires it — and on a record page the button next to a
   field is often the one that deletes the record.

   The two dropdowns are the exception, and have to be. Both render a <button>
   rather than a native <select>, so a selector of inputs alone stepped
   straight over every Project, Status and Source field on the way down a
   form. They are named explicitly, which keeps the exception to these two
   controls rather than to buttons in general.

   Landing on one is safe: this module only moves focus, and the Enter
   handlers live on the text inputs. A dropdown trigger therefore gets Enter
   natively, which is what opens it — exactly what Tab-and-Enter already
   does. */
const FIELD_SELECTOR = [
  'input',
  'select',
  'textarea',
  '.nx-select2__trigger',
  '.dynamic-dropdown-header',
].join(', ');

/**
 * The box to walk inside.
 *
 * closest() returns the NEAREST ancestor matching any of these, so a field in
 * a modal is scoped to that modal and Enter on its last field cannot jump to
 * the page behind it. `.nx-rec` is a record screen, `.nx-page` a list or
 * settings screen, and `[data-field-scope]` is the opt-in for anything that
 * wants a tighter box of its own.
 *
 * Falling back to the body is what keeps a field outside all of them working.
 */
const SCOPE_SELECTOR = 'form, [data-field-scope], .nx-modal, .nx-rec, .nx-page';

/** Whether a field can actually be typed into right now. */
function isEligible(el) {
  if (el.disabled || el.readOnly) return false;
  if (el.type === 'hidden') return false;
  // Taken out of the tab order on purpose; respect that.
  if (el.tabIndex < 0) return false;
  /* Anything with no box: display:none, an unopened accordion, a collapsed
     tab panel — and the visually-hidden checkbox pattern, a real input sized
     to 0×0 behind a styled span. Focus must not land on any of them, so the
     rect is measured every time rather than only when offsetParent is null
     (which it is not for the hidden-checkbox case). */
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

/**
 * Move focus from `from` to the next field after it.
 *
 * @param   {HTMLElement} from  the field Enter was pressed in
 * @returns {boolean} true if focus moved. False means there was no next field
 *          — the caller decides what that means, which is how Enter on the
 *          last field of a form still submits it instead of doing nothing.
 */
export default function focusNextField(from) {
  if (!from || typeof from.closest !== 'function') return false;

  const scope = from.closest(SCOPE_SELECTOR) || document.body;
  const fields = Array.from(scope.querySelectorAll(FIELD_SELECTOR)).filter(isEligible);

  const here = fields.indexOf(from);
  // `from` itself can be ineligible by the time we look (a field that went
  // read-only on save, say), so fall back to document order rather than give up.
  const next = here === -1
    ? fields.find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    : fields[here + 1];

  if (!next) return false;

  next.focus();
  /* Select what is there, so the next keystroke replaces the old value rather
     than landing in the middle of it. Not for a date or colour input, where
     select() is meaningless and throws in some browsers. */
  if (typeof next.select === 'function') {
    try { next.select(); } catch { /* input types that do not support it */ }
  }
  return true;
}

/**
 * The shared "is this Enter, and is it meant for us" test.
 *
 * Shift+Enter is a newline. The modifier chords are shortcuts a field may have
 * its own meaning for. An IME's Enter is confirming a candidate character, not
 * finishing the field — stealing it there loses the word being typed.
 */
export function isPlainEnter(e) {
  return e.key === 'Enter'
    && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
    && !(e.nativeEvent?.isComposing || e.isComposing);
}
