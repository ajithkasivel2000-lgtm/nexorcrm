/**
 * NexorCRM design system.
 *
 * Import tokens.css once (main.jsx) — every component below is styled purely
 * from those variables, so theming happens in one file.
 */
export { default as Button } from './Button';
export { default as Modal } from './Modal';
export { default as DataTable } from './DataTable';
export { default as Sidebar } from './Sidebar';
export { default as Page } from './Page';
export { default as Popover } from './Popover';
export { default as SearchInput } from './SearchInput';
export { default as PhoneInput } from './PhoneInput';
export { default as EmailInput } from './EmailInput';
export { COUNTRIES, DEFAULT_DIAL, countryFor, flagUrl, normalizeNumber, validateNumber } from './countries';
export { EMAIL_RE, EMAIL_MAX_LENGTH, normalizeEmail, emailError, isValidEmail } from './email';
export { Field, Input, Textarea, Checkbox, Switch, FormGrid } from './Form';
export { default as Select } from './Select';
export {
  RecordPage, RecordGrid, RecordColumn, RecordCard, RecordFields, RecordField,
  RecordPhoneField, RecordLookupField, RecordUserField, RecordReadOnly, RecordFileField,
  RecordHero, RecordProgress, RecordTimeline, RecordEmptyTab,
  RecordRadioGroup, RecordRange, RecordPasswordField, RecordAvatarField,
} from './RecordPage';
export { default as RecordViewOnly } from './RecordViewOnly';
export { useRecordViewOnly } from './RecordViewContext';
export { initialsOf, recordStamp, toDateTimeLocal, toDateInput } from './recordFormat';
export { default as Pill } from './Pill';
export { default as RowActions } from './RowActions';
export { toneForStatus } from './statusTone';
export { formatDate, formatDateTime, createdColumn, updatedColumn } from './dateColumns';
export { default as ToastHost } from './Toast';
export { toast } from './toastUtils';
