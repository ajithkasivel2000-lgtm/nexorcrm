import api from './api';

/** Bookings & payments (same API as the web app). */
export const bookingsService = {
  async list(params = {}) {
    return (await api.get('/bookings', { params })).data;
  },
  async get(id) {
    return (await api.get(`/bookings/${id}`)).data;
  },
  async collections(days = 30) {
    return (await api.get('/bookings/collections', { params: { days } })).data;
  },
  async addPayment(id, payment) {
    return (await api.post(`/bookings/${id}/payments`, payment)).data;
  },
  /** A one-time buyer portal sign-in link (valid 7 days) to send the buyer. */
  async portalLink(id) {
    return (await api.post(`/bookings/${id}/portal-link`)).data;
  },
  async paymentLinks(id) {
    return (await api.get(`/bookings/${id}/payment-links`)).data;
  },
  /** A Cashfree payment link for the next due milestone (or milestoneId). */
  async createPaymentLink(id, milestoneId) {
    return (await api.post(`/bookings/${id}/payment-links`, milestoneId ? { milestoneId } : {})).data;
  },
};

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const shortDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
