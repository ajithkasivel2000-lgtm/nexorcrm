import { useState, useEffect } from 'react';
import { Home, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import './EmailTemplates.css';
import submitOnEnter from './utils/submitOnEnter';
import { DataTable, Pill, RowActions, Switch } from './ui';
import { isSystemTemplate } from './utils/emailTemplates';


const EmailTemplates = () => {
  const [templates, setTemplates] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const [editId, setEditId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    templateKey: '',
    subject: '',
    bodyContent: '',
    status: true
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/settings/email-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error fetching email templates:', error);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const response = await fetch(`/api/settings/email-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: !currentStatus })
      });
      if (response.ok) {
        setTemplates(prev =>
          prev.map(t => t.id === id ? { ...t, status: !currentStatus } : t)
        );
      }
    } catch (error) {
      console.error('Error updating template status:', error);
    }
  };

  const handleDeleteSelected = async (ids, clearSelection) => {
    // The ones the app sends by key are refused by the API anyway. Saying so
    // before asking beats a confirmation followed by a partial failure.
    const chosen = templates.filter(t => ids.includes(t.id));
    const locked = chosen.filter(t => isSystemTemplate(t.templateKey));
    const deletable = chosen.filter(t => !isSystemTemplate(t.templateKey));

    if (locked.length > 0) {
      const names = locked.map(t => t.name || t.templateKey).join(', ');
      if (deletable.length === 0) {
        window.appAlert(
          `${names} ${locked.length === 1 ? 'is' : 'are'} sent by the system and cannot be deleted. `
          + 'Switch off the Active toggle instead to stop these emails.',
        );
        return;
      }
      const goOn = await window.appConfirm(
        `${names} cannot be deleted — ${locked.length === 1 ? 'it is' : 'they are'} sent by the system.\n\n`
        + `Delete the other ${deletable.length} template(s)?`,
      );
      if (!goOn) return;
    } else if (!await window.appConfirm(`Delete ${deletable.length} selected template(s)?`)) {
      return;
    }

    try {
      const responses = await Promise.all(
        deletable.map(t => fetch(`/api/settings/email-templates/${t.id}`, { method: 'DELETE' }))
      );
      clearSelection();
      fetchTemplates();
      const failed = responses.filter(r => !r.ok).length;
      if (failed > 0) {
        window.appAlert(`${failed} of ${deletable.length} template(s) could not be deleted.`);
      }
    } catch (error) {
      console.error('Error deleting email templates:', error);
      window.appAlert('Could not reach the server.');
    }
  };

  const handleEdit = (template) => {
    setFormData({
      name: template.name || '',
      templateKey: template.templateKey || '',
      subject: template.subject || '',
      bodyContent: template.bodyContent || '',
      status: template.status
    });
    setEditId(template.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.name) {
        window.appAlert("Template Name is required");
        return;
      }

      const payload = {
        ...formData,
      };

      if (!editId) {
        payload.type = 'Custom';
      }

      // If templateKey is empty, generate one
      if (!payload.templateKey) {
        payload.templateKey = payload.name.toUpperCase().replace(/\s+/g, '_') + '_TEMPLATE';
      }

      const url = editId ? `/api/settings/email-templates/${editId}` : '/api/settings/email-templates';
      const method = editId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // Refresh templates and close form
        fetchTemplates();
        setShowForm(false);
        setEditId(null);
        setFormData({
          name: '',
          templateKey: '',
          subject: '',
          bodyContent: '',
          status: true
        });
      } else {
        const data = await response.json();
        window.appAlert('Error saving template: ' + (data.error || data.message));
      }
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const templateColumns = [
    {
      key: 'name',
      label: 'Template Name / Subject',
      render: t => (
        <div>
          <div className="nx-page__strong">{t.name || '—'}</div>
          {t.subject && <div className="nx-page__muted nx-et__subject">{t.subject}</div>}
        </div>
      ),
      exportValue: t => t.name || '',
    },
    {
      key: 'templateKey',
      label: 'Template Key',
      width: '210px',
      render: t => <span className="nx-page__id">{t.templateKey || '—'}</span>,
    },
    {
      key: 'type',
      label: 'Type',
      width: '130px',
      // The stored type says "Custom" for all of them, including the three the
      // app sends by key. What matters here is whether the template can be
      // removed, so that is what the column shows.
      render: (t) => (isSystemTemplate(t.templateKey)
        ? (
          <span title="Sent by the system — cannot be deleted">
            <Pill tone="neutral">System</Pill>
          </span>
        )
        : <Pill tone="purple">{t.type || 'Custom'}</Pill>),
      sortValue: t => (isSystemTemplate(t.templateKey) ? 'System' : (t.type || 'Custom')),
      exportValue: t => (isSystemTemplate(t.templateKey) ? 'System' : (t.type || 'Custom')),
    },
    {
      key: 'status',
      label: 'Status',
      width: '150px',
      // The switch is the control, so stop the click reaching the row.
      render: t => (
        <span onClick={e => e.stopPropagation()}>
          <Switch
            checked={!!t.status}
            onChange={() => handleToggleStatus(t.id, t.status)}
            label={t.status ? 'Active' : 'Inactive'}
          />
        </span>
      ),
      sortValue: t => (t.status ? 1 : 0),
      exportValue: t => (t.status ? 'Active' : 'Inactive'),
    },
    // Created and Updated are left to DataTable, which appends them in that
    // order and formats them the way every other table does. Defining Updated
    // here put it *before* the appended Created column, which read backwards.
  ];

  return (
    <div className="email-templates-page">
      {/* Header */}
      <div className="et-header-card">
        <div className="et-header-info">
          <h2>Email Templates</h2>
          <div className="page-breadcrumb">
            <Link to="/"><Home size={12} /></Link>
            <span className="slash">/</span>
            <span>Settings</span>
            <span className="slash">/</span>
            <span>Email Templates</span>
          </div>
        </div>
        <button className="et-btn-add" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Add Template
          </button>
      </div>

      {/* Create Template Form */}
      {showForm && (
        <div className="et-form-card">
          <div className="et-form-header">
            <div>
              <h3>Create Template</h3>
              <p>Modify the template subject line and body copy</p>
            </div>
            <button className="et-btn-close" onClick={() => setShowForm(false)}>Close</button>
          </div>

          <div className="et-form-row">
            <div className="et-form-group">
              <label className="et-form-label">Template Name</label>
              <input
                type="text"
                className="et-form-input"
                placeholder="e.g. Welcome Email"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                onKeyDown={submitOnEnter(handleSave)}
              />
            </div>
          </div>

          <div className="et-form-row">
            <div className="et-form-group">
              <label className="et-form-label">Subject</label>
              <input
                type="text"
                className="et-form-input"
                placeholder="Subject line of the email"
                value={formData.subject}
                onChange={e => setFormData({ ...formData, subject: e.target.value })}
                onKeyDown={submitOnEnter(handleSave)}
              />
            </div>
          </div>

          <div className="et-form-row">
            <div className="et-form-group">
              <label className="et-form-label">Body Content</label>
              <textarea
                className="et-form-textarea"
                placeholder="Design your template HTML or plain text here..."
                value={formData.bodyContent}
                onChange={e => setFormData({ ...formData, bodyContent: e.target.value })}
              ></textarea>
            </div>
          </div>

          <div className="et-form-footer">
            <div>
              <div className="et-toggle-wrapper">
                <span className="et-form-label" style={{ marginBottom: 0 }}>Active Status: </span>
                <label className="et-toggle-switch" style={{ margin: '0 8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.checked })}
                  />
                  <span className="et-toggle-slider"></span>
                </label>
                <span className={`et-badge ${formData.status ? 'custom' : 'default'}`}>
                  {formData.status ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="et-supported-tags">
                Supported template placeholders: <span>{`{{employee_name}}`}</span>, <span>{`{{company_name}}`}</span>
              </div>
            </div>
            <div className="et-form-actions">
              <button className="et-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="et-btn-save" onClick={handleSave}>Save Template</button>
            </div>
          </div>
        </div>
      )}

      <DataTable
        columns={templateColumns}
        rows={templates}
        selectable
        exportName="email-templates"
        filters={['type','status']}
        tabsFrom="type"
        persistKey="email-templates"
        searchPlaceholder="Search template name or key..."
        emptyMessage="No templates yet"
        emptyHint="Create a template to start sending branded email."
        onDeleteSelected={handleDeleteSelected}
        actions={template => (
          <RowActions
            label={template.name || 'template'}
            onEdit={() => handleEdit(template)}
          />
        )}
      />
    </div>
  );
};

export default EmailTemplates;
