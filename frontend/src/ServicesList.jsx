import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ProjectsList.css'; // Reuse existing table styles

export default function ServicesList() {
  const [services, setServices] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const res = await fetch('/api/services');
      const data = await res.json();
      setServices(data);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteService = async (id) => {
    if (!window.confirm('Are you sure you want to delete this service?')) return;
    try {
      await fetch(`/api/services/${id}`, { method: 'DELETE' });
      fetchServices();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="projects-page">
      <div className="header-actions">
        <h2>Services List</h2>
        {/* Add button */}
        <button className="btn-add" onClick={() => navigate('/services/add')}>
          <Plus size={16} /> Add New Service
        </button>
      </div>

      <div className="projects-table-card">
        <table className="projects-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{s.category}</td>
                <td>{s.mode}</td>
                <td>{s.status}</td>
                <td>
                  <button className="btn-icon" onClick={() => deleteService(s.id)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center' }}>No services found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
