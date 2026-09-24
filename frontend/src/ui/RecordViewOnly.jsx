import { ViewOnlyContext } from './RecordViewContext';

/**
 * Locks every RecordPage control rendered below it.
 *
 * See RecordViewContext for why the context it provides lives in its own
 * module.
 */
export default function RecordViewOnly({ active = true, children }) {
  return <ViewOnlyContext.Provider value={Boolean(active)}>{children}</ViewOnlyContext.Provider>;
}
