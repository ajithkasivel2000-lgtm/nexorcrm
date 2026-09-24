import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import useListData from './useListData';
import invalidateLeadCache from '../../utils/invalidateLeadCache';
import { Button, DataTable, Field, Input, Modal, Page, RowActions } from '../../ui';

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * The simple reference lists (lead status/type, lead sources, project
 * status/type) are the same screen with different labels: fetch a list,
 * show id / name / created, and create-edit-delete through a small modal.
 *
 * Built on the src/ui design system — this is the reference pattern for
 * migrating the remaining screens.
 *
 * @param {string} apiPath    e.g. '/api/lead-statuses'
 * @param {string} idField    e.g. 'statusId'
 * @param {string} nameField  e.g. 'statusName'
 */
export default function LookupListPage({
  title,
  subtitle,
  apiPath,
  idField,
  nameField,
  idLabel,
  nameLabel,
  storageKey,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValue, setFormValue] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const fetchRecords = useCallback(async () => {
    const response = await fetch(apiPath);
    if (!response.ok) throw new Error(`Failed to fetch ${title} (${response.status})`);
    return response.json();
  }, [apiPath, title]);

  const { rows: records, loading, refresh } = useListData(fetchRecords);

  const openCreateModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setFormValue('');
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (record) => {
    setIsEditMode(true);
    setEditingId(record.id);
    setFormValue(record[nameField] || '');
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch(isEditMode ? `${apiPath}/${editingId}` : apiPath, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [nameField]: formValue }),
      });
      if (response.ok) {
        setIsModalOpen(false);
        refresh();
        // Lead dropdowns and filters are built from these reference lists, so
        // a create / edit / delete must refresh every lead view without a reload.
        invalidateLeadCache();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.message || `Failed to save ${nameLabel}.`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSelected = async (ids, clearSelection) => {
    if (!await window.appConfirm(`Delete ${ids.length} selected ${nameLabel}(s)?`)) return;
    try {
      const responses = await Promise.all(
        ids.map(id => fetch(`${apiPath}/${id}`, { method: 'DELETE' }))
      );
      clearSelection();
      refresh();
      invalidateLeadCache();
      // Report partial failures rather than leaving the rows there unexplained.
      const failed = responses.filter(r => !r.ok).length;
      if (failed > 0) {
        window.appAlert(`${failed} of ${ids.length} ${nameLabel}(s) could not be deleted.`);
      }
    } catch (err) {
      console.error(`Error deleting ${nameLabel}s:`, err);
      window.appAlert('Could not reach the server.');
    }
  };

  const columns = useMemo(() => ([
    {
      key: idField,
      label: idLabel,
      width: '230px',
      render: (r) => <span className="nx-page__id">{r[idField] || '—'}</span>,
    },
    {
      key: nameField,
      label: nameLabel,
      render: (r) => <span className="nx-page__strong">{r[nameField] || '—'}</span>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: '160px',
      render: (r) => formatDate(r.createdAt),
    },
  ]), [idField, nameField, idLabel, nameLabel]);

  return (
    <Page
      title={title}
      subtitle={subtitle}
      actions={
        <Button variant="primary" icon={Plus} onClick={openCreateModal}>
          Create {nameLabel}
        </Button>
      }
    >
      <DataTable
        columns={columns}
        rows={records}
        loading={loading}
        selectable
        exportName={storageKey}
        searchPlaceholder={`Search ${nameLabel.toLowerCase()}...`}
        emptyMessage={`No ${nameLabel.toLowerCase()} yet`}
        emptyHint={`Create your first ${nameLabel.toLowerCase()} to get started.`}
        onDeleteSelected={handleDeleteSelected}
        actions={record => (
          <RowActions
            label={record[nameField] || 'record'}
            onEdit={() => openEditModal(record)}
          />
        )}
      />

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="sm"
        title={isEditMode ? `Edit ${nameLabel}` : `Create ${nameLabel}`}
        description={isEditMode
          ? `Rename this ${nameLabel.toLowerCase()}.`
          : `Add a new ${nameLabel.toLowerCase()} to the list.`}
        footer={
          <>
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              type="submit"
              form="nx-lookup-form"
              loading={isSubmitting}
            >
              {isEditMode ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        {/* The submit button lives in the modal footer, so it reaches this
            form by id rather than by being nested inside it. */}
        <form id="nx-lookup-form" onSubmit={handleSubmit}>
          <Field label={nameLabel} required error={error}>
            <Input
              value={formValue}
              placeholder={nameLabel}
              onChange={(e) => setFormValue(e.target.value)}
              required
              data-autofocus
            />
          </Field>
        </form>
      </Modal>
    </Page>
  );
}
