import { io } from 'socket.io-client';
import { getToken } from './sessionStore';
import { notifyDataChanged } from './dataBus';

/**
 * Live updates from the server (Socket.IO).
 *
 * The server says "rows of kind X changed" for anything saved by anyone in
 * the company, and "you have a new notification" for this user. Both feed the
 * dataBus every screen already listens to, so a lead assigned by a colleague
 * shows up without a reload. Nothing else changes: screens still fetch their
 * own rows from the API, and their polling stays as the fallback.
 */

let socket = null;

export function connectRealtime() {
  const token = getToken();
  if (!token || socket) return socket;
  socket = io({
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 30000,
  });
  socket.on('data:changed', ({ resource } = {}) => notifyDataChanged(resource || undefined));
  socket.on('notification', () => notifyDataChanged('notifications'));
  socket.on('connect_error', (error) => {
    // A dead session: stop trying; the app's 401 handling takes it from here.
    if (String(error?.message) === 'unauthorised') disconnectRealtime();
  });
  return socket;
}

export function disconnectRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
}
