import { createContext, useContext } from 'react';

/**
 * Shared by <Field> and the controls that sit inside it.
 *
 * Field owns the generated id and the error state; the control reads both from
 * here. That keeps every label correctly associated with its input, and every
 * error announced, without callers wiring ids by hand.
 *
 * It lives in its own module so Select can read the context without importing
 * Form, which would be a cycle.
 */
export const FieldContext = createContext(null);

/** Returns {} outside a <Field>, so a control works standalone too. */
export const useField = () => useContext(FieldContext) || {};
