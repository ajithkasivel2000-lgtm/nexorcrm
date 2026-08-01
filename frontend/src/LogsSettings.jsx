import { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import './LogsSettings.css';
import { Link } from 'react-router-dom';

const LogsSettings = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to delete all logs?')) return;
    try {
      const response = await fetch('/api/logs/all', { method: 'DELETE' });
      if (response.ok) {
        fetchLogs();
      }
    } catch (error) {
      console.error('Error deleting all logs:', error);
    }
  };

  const handleDeleteOld = async () => {
    if (!window.confirm('Are you sure you want to delete logs older than 30 days?')) return;
    try {
      const response = await fetch('/api/logs/old', { method: 'DELETE' });
      if (response.ok) {
        fetchLogs();
      }
    } catch (error) {
      console.error('Error deleting old logs:', error);
    }
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    return `${dateStr}, ${timeStr}`;
  };

  return (
    <div className="logs-settings-page">
      <div className="logs-header-top">
        <div className="header-left">
          <h2>Log</h2>
          <div className="page-breadcrumb">
            <Link to="/"><Home size={14} /></Link>
            <span className="slash">/</span>
            <span>Logs</span>
          </div>
        </div>
      </div>

      <div className="logs-content-wrapper">
        <div className="logs-table-column">
          <div className="logs-card">
            <div className="logs-card-header">
              <h3>Logs</h3>
            </div>
            
            <div className="table-responsive">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Event</th>
                    <th>Date / Time</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>Loading logs...</td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>No logs found.</td>
                    </tr>
                  ) : (
                    logs.map(log => (
                      <tr key={log.id}>
                        <td>{log.username}</td>
                        <td>{log.event}</td>
                        <td>{formatDate(log.createdAt)}</td>
                        <td>{log.ipAddress}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="logs-actions-column">
          <div className="logs-actions">
            <button className="btn-action-link" onClick={handleDeleteAll}>
              Delete All Logs
            </button>
            <button className="btn-action-link" onClick={handleDeleteOld}>
              Delete Logs (&gt; 30 days)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogsSettings;
