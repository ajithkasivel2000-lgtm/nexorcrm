import { useState, useEffect } from 'react';
import { Home, Edit2, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './PrimarySourceList.css';

const PrimarySourceList = () => {
  const [sources, setSources] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    sourceName: ''
  });

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const response = await fetch('/api/primary-sources');
      if (response.ok) {
        const data = await response.json();
        setSources(data);
      }
    } catch (error) {
      console.error('Error fetching primary sources:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openCreateModal = () => {
    setIsEditMode(false);
    setFormData({ id: null, sourceName: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (source) => {
    setIsEditMode(true);
    setFormData({ id: source.id, sourceName: source.sourceName });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = isEditMode 
        ? `/api/primary-sources/${formData.id}`
        : '/api/primary-sources';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceName: formData.sourceName }),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setFormData({ id: null, sourceName: '' });
        fetchSources();
      }
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} primary source:`, error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this primary source?')) {
      try {
        const response = await fetch(`/api/primary-sources/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          fetchSources();
        }
      } catch (error) {
        console.error('Error deleting primary source:', error);
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
    <div className="primary-source-page">
      <div className="primary-source-header-top">
        <div className="header-left">
          <h2>Primary Source</h2>
          <div className="page-breadcrumb">
            <Home size={14} style={{cursor: 'pointer'}} onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span>Primary Source</span>
          </div>
        </div>
        <button className="btn-create-source" onClick={openCreateModal}>
          Create Primary Source
        </button>
      </div>

      <div className="primary-source-card">
        <div className="primary-source-card-header">
          <h3>Primary Source List</h3>
          <p>Create, view and edit Primary Source. Assign leads to Primary Source.</p>
        </div>

        <div className="table-responsive">
          <table className="primary-source-table">
            <thead>
              <tr>
                <th>Primary Id</th>
                <th>Primary Source</th>
                <th>Created Date</th>
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.length > 0 ? (
                sources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.sourceId}</td>
                    <td>{source.sourceName}</td>
                    <td>{formatDate(source.createdAt)}</td>
                    <td className="actions-cell">
                      <button 
                        className="btn-icon-action edit" 
                        title="Edit"
                        onClick={() => openEditModal(source)}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className="btn-icon-action delete" 
                        title="Delete"
                        onClick={() => handleDelete(source.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center">No primary sources found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content source-modal">
            <div className="modal-header">
              <h3>{isEditMode ? 'Edit Primary Source' : 'Create New Primary Source'}</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Primary Source :</label>
                  <input 
                    type="text" 
                    name="sourceName" 
                    placeholder="Primary Source" 
                    value={formData.sourceName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="submit" className="btn-submit-source">
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

export default PrimarySourceList;
