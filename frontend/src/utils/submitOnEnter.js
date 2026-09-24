/**
 * Enter saves, for inputs that are not inside a <form>.
 *
 * A text input inside a <form> gets Enter for free — the browser submits. The
 * screens that lay their fields out with plain divs get nothing, so Enter does
 * nothing and the only way to save is to find the button. This gives those
 * inputs the same key without changing how they look or where they sit.
 *
 * Deliberately not applied to textareas: Enter there is a newline.
 *
 *   <input onKeyDown={submitOnEnter(handleSave)} … />
 *
 * @param {Function} save        what to run
 * @param {Function} [canSubmit] optional guard, e.g. () => !busy
 */
export default function submitOnEnter(save, canSubmit) {
  return (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    // IME composition: Enter is confirming a candidate, not finishing the field.
    if (e.nativeEvent?.isComposing) return;
    if (typeof canSubmit === 'function' && !canSubmit()) return;
    e.preventDefault();
    save?.(e);
  };
}
