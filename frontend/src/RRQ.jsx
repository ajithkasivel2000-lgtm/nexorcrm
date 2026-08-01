import { useState, useEffect } from 'react';
import { Edit, Trash2, Folder, User, List, Users, Home } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import './RRQ.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";



const rrqTypes = [
  "Presales",
  "Sales",
  "Channel Partners",
  "CRM"
];

export default function RRQ() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'rrq');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

  const [rrqs, setRrqs] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    projectName: '',
    rrqName: '',
    rrqType: ''
  });

  const [projectsList, setProjectsList] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState(null);

  useEffect(() => {
    fetchRRQs();
    fetchUsers();
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjectsList(data.map(p => p.projectName));
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.map(u => u.username));
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchRRQs = async () => {
    try {
      const response = await fetch('/api/rrq');
      if (response.ok) {
        const data = await response.json();
        setRrqs(data);
      }
    } catch (error) {
      console.error('Failed to fetch RRQs:', error);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/rrq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setIsModalOpen(false);
        setFormData({ projectName: '', rrqName: '', rrqType: '' });
        fetchRRQs();
      }
    } catch (error) {
      console.error('Failed to create RRQ:', error);
    }
  };

  const handleDelete = async (id, rrqId) => {
    const isConfirmed = window.confirm(`re.nexorcrm.com says\nAre you sure you wish to delete this [ ${rrqId} ] RRQ?\nIt will remove all users from the RRQ.`);
    if (isConfirmed) {
      try {
        const response = await fetch(`/api/rrq/${id}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          setRrqs(rrqs.filter(r => r.id !== id));
        }
      } catch (error) {
        console.error('Failed to delete RRQ:', error);
      }
    }
  };

  const exportCSV = () => {
    const headers = ["#", "RRQ Id", "RRQ Name", "RRQ Type", "Project Name", "Assigned Users", "Created Date"];
    const rows = rrqs.map((rrq, index) => [
      index + 1,
      rrq.rrqId || "",
      rrq.rrqName || "",
      rrq.rrqType || "",
      rrq.projectName || "",
      rrq.assignedUsers ? rrq.assignedUsers.join('; ') : "",
      new Date(rrq.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).replace(/,/g, "")
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "rrq_list.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("RRQ List", 14, 15);
    const tableColumn = ["#", "RRQ Id", "RRQ Name", "RRQ Type", "Project Name", "Assigned Users", "Created Date"];
    const tableRows = [];
    rrqs.forEach((rrq, index) => {
      tableRows.push([
        index + 1,
        rrq.rrqId || "-",
        rrq.rrqName || "-",
        rrq.rrqType || "-",
        rrq.projectName || "-",
        rrq.assignedUsers ? rrq.assignedUsers.join(', ') : "-",
        new Date(rrq.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`rrq_list_${Date.now()}.pdf`);
  };

  const handleOpenEdit = (rrq) => {
    setEditFormData({ ...rrq });
    setIsEditModalOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/rrq/${editFormData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      if (response.ok) {
        setIsEditModalOpen(false);
        setEditFormData(null);
        fetchRRQs();
      }
    } catch (error) {
      console.error('Failed to update RRQ:', error);
    }
  };

  const handleAddUser = (e) => {
    const user = e.target.value;
    if (user && !editFormData.assignedUsers.includes(user)) {
      setEditFormData({
        ...editFormData,
        assignedUsers: [...editFormData.assignedUsers, user]
      });
    }
    // reset select to default
    e.target.value = "";
  };

  const handleRemoveUser = (userToRemove) => {
    setEditFormData({
      ...editFormData,
      assignedUsers: editFormData.assignedUsers.filter(u => u !== userToRemove)
    });
  };

  return (
    <div className="rrq-page">
      <div className="rrq-header-top">
        <div className="header-left">
          <h2>RRQ</h2>
          <div className="page-breadcrumb">
            <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span>RRQ List</span>
          </div>
        </div>
        <button className="btn-create-rrq" onClick={() => setIsModalOpen(true)}>
          Create RRQ
        </button>
      </div>

      <div className="rrq-card">
        <div className="rrq-card-header">
          <h3>RRQ List</h3>
          <p>Create, view and edit RRQ. Assign users to RRQ.</p>
        </div>

        {hasExportPermission && (
          <div style={{ padding: '20px 20px 15px 20px', display: 'flex', gap: '8px' }}>
            <button
              onClick={exportCSV}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '13px', cursor: 'pointer', backgroundColor: '#7b68ee', transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Export CSV
            </button>
            <button
              onClick={exportPDF}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '13px', cursor: 'pointer', backgroundColor: '#ef4444', transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Export PDF
            </button>
          </div>
        )}

        <div className="table-responsive">
          <table className="rrq-table">
            <thead>
              <tr>
                <th>#</th>
                <th>RRQ Id</th>
                <th>RRQ Name</th>
                <th>RRQ Type</th>
                <th>Project Name</th>
                <th>Assigned Users</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rrqs.length > 0 ? (
                rrqs.map((rrq, index) => (
                  <tr key={rrq.id}>
                    <td>{index + 1}</td>
                    <td>{rrq.rrqId}</td>
                    <td>{rrq.rrqName}</td>
                    <td><span className="badge-type">{rrq.rrqType}</span></td>
                    <td>{rrq.projectName}</td>
                    <td><span className="user-badge">{rrq.assignedUsers.join(', ')}</span></td>
                    <td>{new Date(rrq.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="rl-actions-cell">
                      <button
                        className="rl-action-btn rl-edit-btn"
                        onClick={() => handleOpenEdit(rrq)}
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        className="rl-action-btn rl-delete-btn"
                        onClick={() => handleDelete(rrq.id, rrq.rrqId)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="text-center">No RRQs found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add RRQ</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">

                <div className="form-group">
                  <label className="form-label">Project Interested</label>
                  <div className="input-with-icon">
                    <div className="input-icon blue">
                      <Folder size={16} />
                    </div>
                    <select
                      className="modal-select"
                      value={formData.projectName}
                      onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                      required
                    >
                      <option value="">Select Project</option>
                      {projectsList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">RRQ Name</label>
                  <div className="input-with-icon">
                    <div className="input-icon">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      className="modal-input"
                      placeholder="Enter RRQ Name"
                      value={formData.rrqName}
                      onChange={(e) => setFormData({ ...formData, rrqName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">RRQ Type</label>
                  <div className="input-with-icon">
                    <div className="input-icon yellow">
                      <List size={16} />
                    </div>
                    <select
                      className="modal-select"
                      value={formData.rrqType}
                      onChange={(e) => setFormData({ ...formData, rrqType: e.target.value })}
                      required
                    >
                      <option value="">Select RRQ Type</option>
                      {rrqTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

              </div>
              <div className="modal-footer">
                <button type="submit" className="btn-submit-modal">Create RRQ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && editFormData && (
        <div className="modal-overlay">
          <div className="modal-content edit-modal">
            <div className="modal-header">
              <h3>Edit [{editFormData.rrqName}]</h3>
              <button className="btn-close" onClick={() => setIsEditModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body edit-body">

                <div className="edit-grid">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Project Name</label>
                    <div className="input-with-icon">
                      <div className="input-icon blue">
                        <Folder size={16} />
                      </div>
                      <select
                        className="modal-select"
                        value={editFormData.projectName}
                        onChange={(e) => setEditFormData({ ...editFormData, projectName: e.target.value })}
                        required
                      >
                        <option value="">Select Project</option>
                        {projectsList.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">RRQ Type</label>
                    <div className="input-with-icon">
                      <div className="input-icon yellow">
                        <List size={16} />
                      </div>
                      <select
                        className="modal-select"
                        value={editFormData.rrqType}
                        onChange={(e) => setEditFormData({ ...editFormData, rrqType: e.target.value })}
                        required
                      >
                        <option value="">Select RRQ Type</option>
                        {rrqTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">RRQ Name</label>
                    <div className="input-with-icon">
                      <div className="input-icon">
                        <User size={16} />
                      </div>
                      <input
                        type="text"
                        className="modal-input"
                        placeholder="Enter RRQ Name"
                        value={editFormData.rrqName}
                        onChange={(e) => setEditFormData({ ...editFormData, rrqName: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Add Users</label>
                    <div className="input-with-icon">
                      <div className="input-icon cyan">
                        <Users size={16} />
                      </div>
                      <select
                        className="modal-select"
                        onChange={handleAddUser}
                        defaultValue=""
                      >
                        <option value="" disabled>Select User</option>
                        {availableUsers.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="users-table-wrapper">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th><User size={14} style={{ marginRight: '5px', verticalAlign: 'text-bottom' }} /> RRQ Name</th>
                        <th style={{ color: '#dc3545' }}><Trash2 size={14} style={{ marginRight: '5px', verticalAlign: 'text-bottom' }} /> Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editFormData.assignedUsers.map(user => (
                        <tr key={user}>
                          <td><User size={14} style={{ marginRight: '5px', verticalAlign: 'text-bottom', color: '#888' }} /> {user}</td>
                          <td>
                            <button
                              type="button"
                              className="remove-icon-btn"
                              onClick={() => handleRemoveUser(user)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
              <div className="modal-footer">
                <button type="submit" className="btn-submit-modal">Edit RRQ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
