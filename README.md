# BaseCraft

A multiplayer voxel sandbox game — Minecraft-style, themed around Base (Coinbase L2). Everything is blue.

- **Frontend**: Next.js 14 + Three.js + Tailwind (Vercel)
- **Backend**: Node.js + Express + Socket.io (Railway)
- **DB**: Supabase (Postgres)
- **Wallet**: RainbowKit + wagmi, Base chain only

See [SETUP.md](SETUP.md) for full setup and deployment instructions.

## Quickstart (local)

```bash
# 1. Install deps
cd backend && npm install
cd ../frontend && npm install

# 2. Set env vars (copy .env.example to .env in both folders and fill in)

# 3. Run backend
cd backend && npm run dev

# 4. Run frontend (new terminal)
cd frontend && npm run dev
```

Open http://localhost:3000.

## Controls

- **WASD** — move
- **Space** — jump
- **Shift** — sprint
- **Mouse** — look
- **Left-click** — break
- **Right-click** — place
- **1–6 / scroll** — switch block
- **T** — chat
- **F** — fly
- **Tab** — player list
- **F3** — toggle coords
- **Esc** — release mouse

## Chat commands

`/tp <user>`, `/spawn`, `/players`, `/help`
