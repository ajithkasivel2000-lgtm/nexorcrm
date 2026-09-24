import api from './api';

const unwrap = (res) => res.data;

export const rrqService = {
  getRRQs: async () => unwrap(await api.get('/rrq')),

  createRRQ: async (payload) => unwrap(await api.post('/rrq', payload)),

  updateRRQ: async (id, payload) => unwrap(await api.put(`/rrq/${id}`, payload)),

  /** Project names for the dropdown (web uses the same /api/projects list). */
  getProjects: async () => {
    const data = unwrap(await api.get('/projects'));
    const items = Array.isArray(data) ? data : (data?.projects || data?.data || []);
    return items
      .map((p) => (typeof p === 'string' ? p : p.projectName))
      .filter(Boolean);
  },

  /** RRQ type names for the dropdown. */
  getTypes: async () => {
    const data = unwrap(await api.get('/rrq-types'));
    const items = Array.isArray(data) ? data : (data?.types || data?.data || []);
    return items
      .map((t) => (typeof t === 'string' ? t : t.typeName))
      .filter(Boolean);
  },

  /** Users for assignment — id + display bits, like web's list. */
  getUsers: async () => {
    const data = unwrap(await api.get('/users'));
    const items = Array.isArray(data) ? data : (data?.users || data?.data || []);
    return items.map((u) => ({
      id: u.id,
      username: u.username,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
      status: u.status,
    }));
  },
};
