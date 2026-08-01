import { useState, useEffect } from 'react';
import { Home, Plus, Search, Download, MoreVertical, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import './EmailTemplates.css';

const EmailTemplates = () => {
  const [templates, setTemplates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState([]);

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
        alert("Template Name is required");
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
        alert('Error saving template: ' + (data.error || data.message));
      }
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.templateKey.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTemplates(filteredTemplates.map(t => t.id));
    } else {
      setSelectedTemplates([]);
    }
  };

  const handleSelectOne = (id) => {
    if (selectedTemplates.includes(id)) {
      setSelectedTemplates(selectedTemplates.filter(tId => tId !== id));
    } else {
      setSelectedTemplates([...selectedTemplates, id]);
    }
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedTemplates.length} templates?`)) return;

    try {
      await Promise.all(selectedTemplates.map(id =>
        fetch(`/api/settings/email-templates/${id}`, { method: 'DELETE' })
      ));
      setSelectedTemplates([]);
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting templates:', error);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.text("Email Templates", 14, 15);
    const tableColumn = ["#", "Name", "Subject", "Template Key", "Type", "Status", "Updated"];
    const tableRows = [];
    filteredTemplates.forEach((t, i) => {
      tableRows.push([
        (i + 1).toString(),
        t.name || "-",
        t.subject || "-",
        t.templateKey || "-",
        t.type || "-",
        t.status ? "Active" : "Inactive",
        new Date(t.updatedAt).toLocaleString()
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`email_templates_${Date.now()}.pdf`);
  };

  const exportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Subject,Template Key,Type,Status,Updated\n";
    filteredTemplates.forEach((t, i) => {
      let row = [
        i + 1,
        t.name || "-",
        t.subject || "-",
        t.templateKey || "-",
        t.type || "-",
        t.status ? "Active" : "Inactive",
        new Date(t.updatedAt).toLocaleString()
      ];
      csvContent += row.map(v => `"${v}"`).join(",") + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `email_templates_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
        {false && (
          <button className="et-btn-add" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Add Template
          </button>
        )}
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

      {/* Table Card */}
      <div className="et-table-card">
        {/* Toolbar */}
        <div className="et-toolbar">
          <div className="et-search-wrapper">
            <Search className="search-icon" size={14} />
            <input
              type="text"
              className="et-search-input"
              placeholder="Search template..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {selectedTemplates.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button className="et-btn-export" style={{ backgroundColor: '#ffe6cc', color: '#a0522d', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={exportCSV}>
              <Download size={14} /> Export CSV
            </button>
            <button className="et-btn-export" style={{ backgroundColor: '#ffebee', color: '#b71c1c', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={exportPDF}>
              <Download size={14} /> Export PDF
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="et-table-wrapper">
          <table className="et-table">
            <thead>
              <tr>
                <th style={{ width: '40px', paddingLeft: '24px', display: 'none' }}>
                  <input
                    type="checkbox"
                    checked={filteredTemplates.length > 0 && selectedTemplates.length === filteredTemplates.length}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: '40px' }}>#</th>
                <th>TEMPLATE NAME / SUBJECT</th>
                <th>TEMPLATE KEY</th>
                <th>TYPE</th>
                <th>STATUS</th>
                <th>UPDATED</th>
                <th style={{ width: '60px', textAlign: 'center' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#a0aec0' }}>
                    No templates found.
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((template, index) => (
                  <tr key={template.id}>
                    <td style={{ paddingLeft: '24px', display: 'none' }}>
                      <input
                        type="checkbox"
                        checked={selectedTemplates.includes(template.id)}
                        onChange={() => handleSelectOne(template.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td>{index + 1}</td>
                    <td>
                      <span className="et-td-name">{template.name}</span>
                      <span className="et-td-subject">{template.subject}</span>
                    </td>
                    <td><span className="et-td-key">{template.templateKey}</span></td>
                    <td>
                      <span className={`et-badge ${template.type === 'Custom' ? 'custom' : 'default'}`}>
                        {template.type}
                      </span>
                    </td>
                    <td>
                      <div className="et-toggle-wrapper">
                        <label className="et-toggle-switch">
                          <input
                            type="checkbox"
                            checked={template.status}
                            onChange={() => handleToggleStatus(template.id, template.status)}
                          />
                          <span className="et-toggle-slider"></span>
                        </label>
                        <span className={`et-toggle-label ${!template.status ? 'inactive' : ''}`}>
                          {template.status ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: '11px', color: '#718096' }}>
                      {new Date(template.updatedAt).toLocaleString('en-US', {
                        month: 'numeric', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true
                      })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="et-btn-action" onClick={() => handleEdit(template)}>
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="et-footer">
          <div>Showing 1 to {filteredTemplates.length} of {filteredTemplates.length} entries</div>
          <div className="et-pagination">
            <button className="et-page-btn"><ChevronLeft size={14} /></button>
            <button className="et-page-btn active">1</button>
            <button className="et-page-btn"><ChevronRight size={14} /></button>
          </div>
          <div className="et-show-entries">
            Show
            <select className="et-select-entries" defaultValue="25">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            entries
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailTemplates;
