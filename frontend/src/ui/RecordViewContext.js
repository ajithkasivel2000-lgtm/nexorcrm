import { createContext, useContext } from 'react';

/**
 * Marks a record subtree as read-only.
 *
 * RecordPage's fields read this instead of taking a `viewOnly` prop each, so a
 * page locks every control below it by wrapping once in <RecordViewOnly>.
 *
 * The context and its hook live here, apart from both RecordPage (which reads
 * them) and RecordViewOnly (which provides them), so neither has to import the
 * other and no cycle forms. Keeping the component out of this module is also
 * what lets Fast Refresh update it without remounting every consumer.
 */
export const ViewOnlyContext = createContext(false);

/** Returns false outside a <RecordViewOnly>, so controls stay editable by default. */
export function useRecordViewOnly() {
  return useContext(ViewOnlyContext);
}
