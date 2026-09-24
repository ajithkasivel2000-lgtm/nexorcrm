import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useListData } from './components/Leads';
import invalidateLeadCache from './utils/invalidateLeadCache';
import { Button, DataTable, Field, FormGrid, Input, Modal, Page, Pill, RowActions, toneForStatus } from './ui';
import usePagePermissions from './hooks/usePagePermissions';
import DynamicDropdown from './components/DynamicDropdown';

const EMPTY_FORM = {
  projectName: '',
  projectLocation: '',
  projectType: '',
  projectStatus: '',
};

const ProjectsList = () => {
  const navigate = useNavigate();
  // Gated by this user's own permissions. See usePagePermissions.
  const { canCreate, canEdit, canDelete, canExport } = usePagePermissions('projects');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchProjectsRequest = useCallback(async () => {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error(`Failed to fetch projects (${response.status})`);
    return response.json();
  }, []);

  const { rows: projects, loading, refresh } = useListData(fetchProjectsRequest);

  // Newest activity first. DataTable keeps this order until the viewer sorts.
  const sortedProjects = useMemo(() => (
    [...projects].sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt).getTime();
      return bDate - aDate;
    })
  ), [projects]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setIsModalOpen(false);
        setFormData(EMPTY_FORM);
        refresh();
        // Leads reference projects (dropdowns, filters, lead.project), so a
        // project create/delete must refresh every lead view too.
        invalidateLeadCache();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.message || 'Failed to create project.');
      }
    } catch (err) {
      console.error('Error creating project:', err);
      setError('Could not reach the server.');
    } finally {
      setIsSubmitting(false);
    }
  };



  const handleDeleteSelected = async (ids, clearSelection) => {
    if (!await window.appConfirm(`Delete ${ids.length} selected project(s)?`)) return;
    try {
      const responses = await Promise.all(
        ids.map(id => fetch(`/api/projects/${id}`, { method: 'DELETE' }))
      );
      clearSelection();
      refresh();
      invalidateLeadCache();
      const failed = responses.filter(r => !r.ok).length;
      if (failed > 0) {
        window.appAlert(`${failed} of ${ids.length} project(s) could not be deleted.`);
      }
    } catch (err) {
      console.error('Error deleting projects:', err);
      window.appAlert('Could not reach the server.');
    }
  };

  const columns = useMemo(() => ([
    {
      key: 'projectName',
      label: 'Project Name',
      render: r => <span className="nx-page__strong">{r.projectName || '—'}</span>,
    },
    { key: 'projectLocation', label: 'Project Location' },
    { key: 'projectType', label: 'Project Type', width: '170px' },
    {
      key: 'projectStatus',
      label: 'Project Status',
      width: '180px',
      render: r => (r.projectStatus
        ? <Pill tone={toneForStatus(r.projectStatus)} dot>{r.projectStatus}</Pill>
        : '—'),
    },
  ]), []);

  return (
    <Page
      title="Projects"
      subtitle="Create, view and edit Projects. Assign users to Projects."
      actions={canCreate ? (
        <Button variant="primary" icon={Plus} onClick={openCreate}>
          Create Project
        </Button>
      ) : null}
    >
      <DataTable
        columns={columns}
        rows={sortedProjects}
        loading={loading}
        selectable
        exportName={canExport ? 'projects' : undefined}
        filters={['projectType', 'projectStatus', 'projectLocation']}
        tabsFrom="projectStatus"
        searchPlaceholder="Search project, location or type..."
        emptyMessage="No projects yet"
        emptyHint="Create your first project to get started."
        onDeleteSelected={canDelete ? handleDeleteSelected : undefined}
        actions={row => (
          <RowActions
            label={row.projectName || 'project'}
            onEdit={canEdit ? () => navigate(`/projects/edit/${row.id}`) : undefined}
          />
        )}
      />

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="md"
        title="Create a new project"
        description="Projects are referenced by leads, dropdowns and filters."
        footer={
          <>
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="nx-project-form" loading={isSubmitting}>
              Create Project
            </Button>
          </>
        }
      >
        <form id="nx-project-form" onSubmit={handleSubmit}>
          <FormGrid columns={2}>
            <Field label="Project Name" required error={error} className="nx-field--full">
              <Input
                name="projectName"
                placeholder="Project Name"
                value={formData.projectName}
                onChange={handleInputChange}
                required
                data-autofocus
              />
            </Field>
            <Field label="Project Location" className="nx-field--full">
              <Input
                name="projectLocation"
                placeholder="Project Location"
                value={formData.projectLocation}
                onChange={handleInputChange}
              />
            </Field>
            {/* Backed by the Project Type and Project Status masters, so a
                missing one can be added here instead of abandoning the form
                to go and create it. */}
            <Field label="Project Type">
              <DynamicDropdown
                name="projectType"
                placeholder="Select Project Type"
                apiUrl="/api/project-types"
                displayKey="typeName"
                valueKey="typeName"
                postPayloadKey="typeName"
                value={formData.projectType}
                onChange={handleInputChange}
              />
            </Field>
            <Field label="Status">
              <DynamicDropdown
                name="projectStatus"
                placeholder="Select Status"
                apiUrl="/api/project-statuses"
                displayKey="statusName"
                valueKey="statusName"
                postPayloadKey="statusName"
                value={formData.projectStatus}
                onChange={handleInputChange}
              />
            </Field>
          </FormGrid>
        </form>
      </Modal>
    </Page>
  );
};

export default ProjectsList;
