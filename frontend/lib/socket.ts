import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  const url = process.env.NEXT_PUBLIC_BACKEND_URL;

  // Silent localhost fallback on a production host is the #1 cause of
  // "stuck on Loading…": the page loads, the socket tries localhost:4000,
  // nothing happens, user sees a blank world forever. Scream in the
  // console so at least the dev/user sees it on F12.
  if (!url && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    // eslint-disable-next-line no-console
    console.error(
      '[BaseCraft] NEXT_PUBLIC_BACKEND_URL is not set on Vercel! ' +
        'Add it in Settings → Environment Variables and redeploy.',
    );
  }

  socket = io(url ?? 'http://localhost:4000', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
