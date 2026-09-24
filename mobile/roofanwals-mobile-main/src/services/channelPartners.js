import api from './api';

const unwrap = (res) => res.data;

export const channelPartnersService = {
  async getChannelPartners() {
    return unwrap(await api.get('/channel-partners'));
  },

  async getChannelPartner(id) {
    return unwrap(await api.get(`/channel-partners/${id}`));
  },

  async createChannelPartner(payload) {
    return unwrap(await api.post('/channel-partners', payload));
  },

  async updateChannelPartner(id, payload) {
    return unwrap(await api.put(`/channel-partners/${id}`, payload));
  },
};
