import api from './api';

export const projectsService = {
  async getProjects({ page = 1, limit = 20, search = '' } = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    const res = await api.get('/projects', { params });
    return res.data;
  },

  async getProject(id) {
    const res = await api.get(`/projects/${id}`);
    return res.data;
  },

  async getProjectSummary(id) {
    const res = await api.get(`/projects/${id}/summary`);
    return res.data;
  },

  async getProjectUnits(id) {
    const res = await api.get(`/projects/${id}/units`);
    return res.data;
  },
};
