import api from './api';

export const opportunitiesService = {
  async getOpportunities({ page = 1, limit = 20, search = '' } = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    const res = await api.get('/opportunities', { params });
    return res.data;
  },

  async getOpportunity(id) {
    const res = await api.get(`/opportunities/${id}`);
    return res.data;
  },
};
