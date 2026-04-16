import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { world } from './world';
import { registerSocketHandlers } from './socket-handlers';

const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? '*';

async function main() {
  const app = express();

  // CORS: allow the configured frontend origin (comma separated supported)
  const allowed =
    FRONTEND_ORIGIN === '*'
      ? true
      : FRONTEND_ORIGIN.split(',').map((s) => s.trim());

  app.use(cors({ origin: allowed, credentials: true }));
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ ok: true, name: 'BaseCraft backend', version: '1.0.0' });
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, worldReady: world.isReady() });
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: allowed,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 20000,
    pingTimeout: 25000,
  });

  // Init world first so connections can be accepted safely
  await world.init();
  registerSocketHandlers(io);

  server.listen(PORT, () => {
    console.log(`[basecraft] listening on :${PORT}`);
    console.log(`[basecraft] frontend origin: ${FRONTEND_ORIGIN}`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
