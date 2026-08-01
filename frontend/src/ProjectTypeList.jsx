import { useState, useEffect } from 'react';
import { Home, Edit2, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ProjectTypeList.css';

const ProjectTypeList = () => {
  const [types, setTypes] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    typeName: ''
  });

  useEffect(() => {
    fetchTypes();
  }, []);

  const fetchTypes = async () => {
    try {
      const response = await fetch('/api/project-types');
      if (response.ok) {
        const data = await response.json();
        setTypes(data);
      }
    } catch (error) {
      console.error('Error fetching project types:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openCreateModal = () => {
    setIsEditMode(false);
    setFormData({ id: null, typeName: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (type) => {
    setIsEditMode(true);
    setFormData({ id: type.id, typeName: type.typeName });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = isEditMode 
        ? `/api/project-types/${formData.id}`
        : '/api/project-types';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ typeName: formData.typeName }),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setFormData({ id: null, typeName: '' });
        fetchTypes();
      }
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} project type:`, error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this project type?')) {
      try {
        const response = await fetch(`/api/project-types/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          fetchTypes();
        }
      } catch (error) {
        console.error('Error deleting project type:', error);
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
    <div className="project-type-page">
      <div className="project-type-header-top">
        <div className="header-left">
          <h2>Project Type</h2>
          <div className="page-breadcrumb">
            <Home size={14} style={{cursor: 'pointer'}} onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span>Project Type</span>
          </div>
        </div>
        <button className="btn-create-type" onClick={openCreateModal}>
          Create Project Type
        </button>
      </div>

      <div className="project-type-card">
        <div className="project-type-card-header">
          <h3>Project Type</h3>
          <p>Create, view and edit Project Type. Assign projects to Project Type.</p>
        </div>

        <div className="table-responsive">
          <table className="project-type-table">
            <thead>
              <tr>
                <th>Project Type Id</th>
                <th>Project Type</th>
                <th>Created Date</th>
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.length > 0 ? (
                types.map((type) => (
                  <tr key={type.id}>
                    <td>{type.typeId}</td>
                    <td>{type.typeName}</td>
                    <td>{formatDate(type.createdAt)}</td>
                    <td className="actions-cell">
                      <button 
                        className="btn-icon-action edit" 
                        title="Edit"
                        onClick={() => openEditModal(type)}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className="btn-icon-action delete" 
                        title="Delete"
                        onClick={() => handleDelete(type.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center">No project types found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content type-modal">
            <div className="modal-header">
              <h3>{isEditMode ? 'Edit Project Type' : 'Create New Project Type'}</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Project Type :</label>
                  <input 
                    type="text" 
                    name="typeName" 
                    placeholder="Project Type" 
                    value={formData.typeName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="submit" className="btn-submit-type">
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

export default ProjectTypeList;
