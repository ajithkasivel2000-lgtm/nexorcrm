import { useEffect, useMemo, useState } from 'react';
import { Button, Field, FormGrid, Input, Modal, Select, Textarea } from '../ui';
import DynamicDropdown from './DynamicDropdown';

/**
 * The extra details a status change needs, asked for in a dialog.
 *
 * Most statuses carry information beyond the word itself: a rejection needs a
 * reason, a site visit needs a date, an allocation needs somebody to allocate
 * to. Setting the status without them leaves a lead that says "Rejected" and
 * cannot say why.
 *
 * The field sets and the payloads match the ones the lead profile submits, so
 * a status set from the list is indistinguishable from one set on the record.
 */

import { ACTION_ONLY_STATUSES, FORMS } from './LeadStatusUtils';
import { boundsFor } from '../utils/dateBounds';

export default function LeadStatusDialog({ open, status, lead, onCancel, onSubmit, saving }) {
  const form = FORMS[status];
  const [values, setValues] = useState({});
  const [users, setUsers] = useState([]);

  // Start from whatever the lead already has, so a correction is an edit
  // rather than a retype.
  useEffect(() => {
    if (!open || !form) return;
    const start = {};
    for (const field of form.fields) {
      const existing = lead?.[field.name];
      start[field.name] = field.type === 'datetime-local' && existing
        ? String(existing).slice(0, 16)
        : (existing || '');
    }
    setValues(start);
  }, [open, status, lead, form]);

  const needsUsers = useMemo(
    () => Boolean(form?.fields.some((f) => f.type === 'user')),
    [form],
  );

  useEffect(() => {
    if (!open || !needsUsers) return;
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setUsers(rows.map((u) => u.username).filter(Boolean)))
      .catch(() => setUsers([]));
  }, [open, needsUsers]);

  if (!form) return null;

  const set = (name) => (e) => setValues((prev) => ({ ...prev, [name]: e.target.value }));

  const missing = form.fields
    .filter((f) => f.required && !String(values[f.name] || '').trim())
    .map((f) => f.label);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (missing.length) return;

    /* The calendar greys out what a field cannot mean, but a typed date can
       still get past it. Checked again here so the rule holds however the
       value arrived, and named so the reason is on screen rather than the
       save just doing nothing. */
    const now = Date.now();
    for (const field of form.fields) {
      const raw = values[field.name];
      if (!field.when || !raw) continue;
      const at = new Date(raw).getTime();
      if (Number.isNaN(at)) continue;
      if (field.when === 'future' && at < now) {
        window.appAlert(`${field.label} cannot be in the past.`);
        return;
      }
      if (field.when === 'past' && at > now) {
        window.appAlert(`${field.label} cannot be in the future.`);
        return;
      }
    }

    // A site-visit stage writes `siteVisitStatus`, not the lead's own status,
    // so the `sv:` key must not travel as one.
    const isStage = String(status).startsWith('sv:');
    const stageName = isStage ? String(status).slice(3) : status;

    /* An action carries its own fields and leaves the stage where it is.
       Allocating used to overwrite it, so handing on a lead that was at Site
       Visit left it reading as Contacted. */
    const isAction = ACTION_ONLY_STATUSES.has(status);

    const payload = {
      ...((isStage || isAction) ? {} : { status }),
      ...form.toPayload(values),
      summary: form.summary ? form.summary(values) : stageName,
    };

    /* Allocating hands the lead to a colleague, which is the same move the
       profile's Lead Owner picker makes — and that one asks first. A status
       dialog is one click from a list, so it is the easier of the two to set
       off by accident. Both the payload's owner and the lead's are usernames
       by the time they reach here, so they compare directly. */
    if (payload.owner && payload.owner !== lead?.owner) {
      const from = lead?.owner || 'nobody';
      const ok = await window.appConfirm(
        `Move this lead from ${from} to ${payload.owner}?\n\n`
        + `${lead?.name || 'This lead'} will leave ${from}'s list and appear in ${payload.owner}'s.`,
        'Change lead owner',
      );
      if (!ok) return;
    }

    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="md"
      title={form.title}
      description={`${lead?.name || 'This lead'} — ${form.description}`}
      footer={
        <>
          <Button onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form="nx-status-form"
            loading={saving}
            disabled={missing.length > 0}
          >
            Save status
          </Button>
        </>
      }
    >
      <form id="nx-status-form" onSubmit={handleSubmit}>
        <FormGrid columns={2}>
          {form.fields.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              required={field.required}
              className={field.full ? 'nx-field--full' : undefined}
            >
              {field.type === 'textarea' && (
                <Textarea
                  rows={3}
                  name={field.name}
                  placeholder={field.placeholder}
                  value={values[field.name] || ''}
                  onChange={set(field.name)}
                />
              )}
              {field.type === 'select' && (
                <Select
                  name={field.name}
                  value={values[field.name] || ''}
                  onChange={set(field.name)}
                  options={field.options}
                  placeholder="Select"
                />
              )}
              {field.type === 'master' && (
                <DynamicDropdown
                  apiUrl={field.api}
                  displayKey={field.field}
                  valueKey={field.field}
                  postPayloadKey={field.field}
                  placeholder={field.placeholder}
                  name={field.name}
                  value={values[field.name] || ''}
                  onChange={set(field.name)}
                />
              )}
              {field.type === 'user' && (
                <Select
                  name={field.name}
                  value={values[field.name] || ''}
                  onChange={set(field.name)}
                  options={users}
                  placeholder="Select a user"
                />
              )}
              {!['textarea', 'select', 'user', 'master'].includes(field.type) && (
                <Input
                  type={field.type}
                  name={field.name}
                  placeholder={field.placeholder}
                  value={values[field.name] || ''}
                  onChange={set(field.name)}
                  /* Greys out the dates this field cannot mean. Which way it
                     points is declared on the field itself in LeadStatusUtils,
                     because it is not the same answer everywhere: a visit is
                     scheduled forwards, but a visit marked done happened
                     already. */
                  {...boundsFor(field.when)}
                />
              )}
            </Field>
          ))}
        </FormGrid>
      </form>
    </Modal>
  );
}
