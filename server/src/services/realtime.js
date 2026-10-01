import { Server } from 'socket.io';

let io = null;
const pending = new Map();

const room = (code) => `property:${String(code || '').toUpperCase()}`;

export function initRealtime(httpServer, corsOrigin) {
  io = new Server(httpServer, { cors: { origin: corsOrigin } });
  io.on('connection', (socket) => {
    socket.on('join', ({ propertyCode } = {}) => {
      if (propertyCode) socket.join(room(propertyCode));
    });
    socket.on('leave', ({ propertyCode } = {}) => {
      if (propertyCode) socket.leave(room(propertyCode));
    });
  });
  return io;
}

// Screens re-fetch their snapshot on "changed", so the socket only carries a signal, never staff data.
// Bursts (e.g. a CSV import of 500 punches) are coalesced into one signal per property.
export function notifyProperty(code) {
  if (!io || !code) return;
  const r = room(code);
  if (pending.has(r)) return;
  pending.set(
    r,
    setTimeout(() => {
      pending.delete(r);
      io.to(r).emit('changed');
    }, 250)
  );
}

export function notifyAll() {
  if (io) io.emit('changed');
}
