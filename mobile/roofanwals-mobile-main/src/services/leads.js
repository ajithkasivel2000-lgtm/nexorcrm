import api from './api';

export const leadsService = {
  async getLeads({ page = 1, limit = 20, search = '', status = '' } = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    if (status) params.status = status;
    const res = await api.get('/leads', { params });
    return res.data;
  },

  async createLead(payload) {
    const res = await api.post('/leads', payload);
    return res.data;
  },

  /** Dropdown options from a list endpoint (projects, sources). */
  async getOptions(endpoint, displayKey) {
    const res = await api.get(endpoint);
    const data = res.data;
    const items = Array.isArray(data) ? data : (data?.projects || data?.sources || data?.data || data?.items || []);
    return items.map((it) => (typeof it === 'string' ? it : (it[displayKey] || it.name || it.sourceName || it.projectName || ''))).filter(Boolean);
  },

  async getLead(id) {
    const res = await api.get(`/leads/${id}`);
    return res.data;
  },


};
