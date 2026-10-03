import api from './api';

/** The signed-in user's notifications — newest first, with the unread count. */
export const notificationsService = {
  async list() {
    const res = await api.get('/notifications');
    return res.data || { items: [], unread: 0 };
  },

  async markRead(id) {
    const res = await api.post(`/notifications/${id}/read`);
    return res.data;
  },

  async markAllRead() {
    const res = await api.post('/notifications/read-all');
    return res.data;
  },
};
