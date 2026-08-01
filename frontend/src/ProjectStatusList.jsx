import { useState, useEffect } from 'react';
import { Home, Edit2, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ProjectStatusList.css';

const ProjectStatusList = () => {
  const [statuses, setStatuses] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    statusName: ''
  });

  useEffect(() => {
    fetchStatuses();
  }, []);

  const fetchStatuses = async () => {
    try {
      const response = await fetch('/api/project-statuses');
      if (response.ok) {
        const data = await response.json();
        setStatuses(data);
      }
    } catch (error) {
      console.error('Error fetching project statuses:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEdit = (status) => {
    setFormData({ statusName: status.statusName });
    setEditingId(status.id);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingId 
        ? `/api/project-statuses/${editingId}` 
        : '/api/project-statuses';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setFormData({ statusName: '' });
        setEditingId(null);
        fetchStatuses();
      }
    } catch (error) {
      console.error('Error saving project status:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this status?')) {
      try {
        const response = await fetch(`/api/project-statuses/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          fetchStatuses();
        }
      } catch (error) {
        console.error('Error deleting project status:', error);
      }
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours.toString().padStart(2, '0');
    return `${day}-${month}-${year} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  };

  return (
    <div className="project-status-page">
      <div className="project-status-header-top">
        <div className="header-left">
          <h2>Project Status</h2>
          <div className="page-breadcrumb">
            <Home size={14} style={{cursor: 'pointer'}} onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span>Projects Status</span>
          </div>
        </div>
        <button 
          className="btn-create-status" 
          onClick={() => {
            setFormData({ statusName: '' });
            setEditingId(null);
            setIsModalOpen(true);
          }}
        >
          Create Project Status
        </button>
      </div>

      <div className="project-status-card">
        <div className="project-status-card-header">
          <h3>Projects Status</h3>
          <p>Create, view and edit Projects. Assign users to Projects.</p>
        </div>

        <div className="table-responsive">
          <table className="project-status-table">
            <thead>
              <tr>
                <th>Status Id</th>
                <th>Project Status</th>
                <th>Created Date</th>
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {statuses.length > 0 ? (
                statuses.map((status) => (
                  <tr key={status.id}>
                    <td>{status.statusId}</td>
                    <td>{status.statusName}</td>
                    <td>{formatDate(status.createdAt)}</td>
                    <td className="actions-cell">
                      <button 
                        className="btn-icon-action edit" 
                        title="Edit"
                        onClick={() => handleEdit(status)}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className="btn-icon-action delete" 
                        title="Delete"
                        onClick={() => handleDelete(status.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center">No statuses found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content status-modal">
            <div className="modal-header">
              <h3>{editingId ? 'Edit Project Status' : 'Create New Project Status'}</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Project Status :</label>
                  <input 
                    type="text" 
                    name="statusName" 
                    placeholder="Project Status" 
                    value={formData.statusName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="submit" className="btn-submit-status">
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectStatusList;
