import { useState, useEffect } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ProjectsList.css'; // Reuse existing table styles

export default function EnquiriesList() {
  const [enquiries, setEnquiries] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchEnquiries();
  }, []);

  const fetchEnquiries = async () => {
    try {
      const res = await fetch('/api/enquiries');
      const data = await res.json();
      setEnquiries(data);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteEnquiry = async (id) => {
    if (!window.confirm('Are you sure you want to delete this enquiry?')) return;
    try {
      await fetch(`/api/enquiries/${id}`, { method: 'DELETE' });
      fetchEnquiries();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="projects-page">
      <div className="header-actions" style={{ marginBottom: '20px' }}>
        <h2>Website Enquiries</h2>
      </div>

      <div className="projects-table-card">
        <div className="table-responsive">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Source</th>
                <th>Project / Property</th>
                <th>Message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {enquiries.map(enq => (
                <tr key={enq.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(enq.createdAt).toLocaleDateString()}
                  </td>
                  <td>{enq.name}</td>
                  <td>
                    {enq.mobile}<br/>
                    <small style={{ color: '#666' }}>{enq.email}</small>
                  </td>
                  <td>{enq.source}</td>
                  <td>{enq.project || '-'}</td>
                  <td style={{ maxWidth: '300px', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    {enq.message || '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-icon" title="View Enquiry" onClick={() => navigate(`/enquiries/${enq.id}`)}>
                        <Eye size={16} color="#193e2f" />
                      </button>
                      <button className="btn-icon" title="Delete" onClick={() => deleteEnquiry(enq.id)}>
                        <Trash2 size={16} color="#ef4444" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {enquiries.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center' }}>No enquiries found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
