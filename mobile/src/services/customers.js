import api from './api';

export const customersService = {
  async getCustomers() {
    const res = await api.get('/customers');
    return res.data;
  },

  async getCustomer(id) {
    const res = await api.get(`/customers/${id}`);
    return res.data;
  },
};
