import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ProjectsList.css'; // Reuse existing table styles

export default function PropertiesList() {
  const [properties, setProperties] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      const res = await fetch('/api/properties');
      const data = await res.json();
      setProperties(data);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteProperty = async (id) => {
    if (!window.confirm('Are you sure you want to delete this property?')) return;
    try {
      await fetch(`/api/properties/${id}`, { method: 'DELETE' });
      fetchProperties();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="projects-page">
      <div className="header-actions">
        <h2>Properties List</h2>
        {/* Add button */}
        <button className="btn-add" onClick={() => navigate('/properties/add')}>
          <Plus size={16} /> Add New Property
        </button>
      </div>

      <div className="projects-table-card">
        <table className="projects-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Property Name</th>
              <th>Category</th>
              <th>Type</th>
              <th>Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {properties.map(p => (
              <tr key={p.id}>
                <td>{p.propertyId}</td>
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td>{p.type}</td>
                <td>{p.price}</td>
                <td>
                  <button className="btn-icon" onClick={() => deleteProperty(p.id)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center' }}>No properties found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
