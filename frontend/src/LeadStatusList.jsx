import { useState, useEffect } from 'react';
import { Home, Edit2, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './LeadStatusList.css';

const LeadStatusList = () => {
  const [statuses, setStatuses] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    statusName: ''
  });

  useEffect(() => {
    fetchStatuses();
  }, []);

  const fetchStatuses = async () => {
    try {
      const response = await fetch('/api/lead-statuses');
      if (response.ok) {
        const data = await response.json();
        setStatuses(data);
      }
    } catch (error) {
      console.error('Error fetching lead statuses:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openCreateModal = () => {
    setIsEditMode(false);
    setFormData({ id: null, statusName: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (status) => {
    setIsEditMode(true);
    setFormData({ id: status.id, statusName: status.statusName });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = isEditMode 
        ? `/api/lead-statuses/${formData.id}`
        : '/api/lead-statuses';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ statusName: formData.statusName }),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setFormData({ id: null, statusName: '' });
        fetchStatuses();
      }
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} lead status:`, error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this lead status?')) {
      try {
        const response = await fetch(`/api/lead-statuses/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          fetchStatuses();
        }
      } catch (error) {
        console.error('Error deleting lead status:', error);
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
    <div className="lead-status-page">
      <div className="lead-status-header-top">
        <div className="header-left">
          <h2>Lead Status</h2>
          <div className="page-breadcrumb">
            <Home size={14} style={{cursor: 'pointer'}} onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span>Lead Status</span>
          </div>
        </div>
        <button className="btn-create-status" onClick={openCreateModal}>
          Create Lead Status
        </button>
      </div>

      <div className="lead-status-card">
        <div className="lead-status-card-header">
          <h3>Lead Status List</h3>
          <p>Create, view and edit Lead Status. Assign leads to Lead Status.</p>
        </div>

        <div className="table-responsive">
          <table className="lead-status-table">
            <thead>
              <tr>
                <th>Status Id</th>
                <th>Lead Status</th>
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
                        onClick={() => openEditModal(status)}
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
                  <td colSpan="4" className="text-center">No lead statuses found</td>
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
              <h3>{isEditMode ? 'Edit Lead Status' : 'Create New Lead Status'}</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Lead Status :</label>
                  <input 
                    type="text" 
                    name="statusName" 
                    placeholder="Lead Status" 
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

export default LeadStatusList;
