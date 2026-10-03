import api from './api';

/**
 * Dashboard data — one call returns everything the web dashboard shows:
 * headline counts, sparklines, 12-month trend, breakdowns, workload,
 * revenue and recent items, all under `overview`.
 */
export const dashboardService = {
  async getOverview() {
    const res = await api.get('/dashboard');
    return res.data?.overview ?? null;
  },

  async getStats() {
    const res = await api.get('/dashboard');
    return res.data;
  },

  async getRecentLeads() {
    const res = await api.get('/leads', { params: { limit: 5, page: 1 } });
    return res.data;
  },
};
