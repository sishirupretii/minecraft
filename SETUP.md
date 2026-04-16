# BaseCraft — Setup & Deployment Guide

A top-to-bottom walkthrough assuming no prior experience. Follow top to bottom.

Estimated time: 30–45 min the first time.

---

## 0. Tools you need (one-time install)

1. **Node.js 20 LTS** — https://nodejs.org/ (pick the "LTS" download)
2. **Git** — https://git-scm.com/downloads
3. A **GitHub account** — https://github.com/
4. A **Supabase account** (free) — https://supabase.com/
5. A **Vercel account** (free) — https://vercel.com/
6. A **Railway account** (free trial / hobby) — https://railway.app/

Verify Node & Git are installed. In a terminal:
```
node -v     # should print v20.x or higher
git --version
```

---

## 1. Supabase setup

1. Go to https://supabase.com/ → **New project**.
2. Name it `basecraft`, pick a strong DB password (save it), closest region, and click **Create**.
3. Wait ~2 min for provisioning.
4. Left sidebar → **SQL Editor** → **New query**. Paste this and **Run**:

```sql
create table players (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  wallet_address text,
  created_at timestamp default now(),
  last_seen timestamp default now()
);

create table blocks (
  id bigserial primary key,
  x int not null,
  y int not null,
  z int not null,
  block_type text not null,
  placed_by text,
  updated_at timestamp default now(),
  unique(x, y, z)
);
create index blocks_coords on blocks(x, y, z);

create table chat_messages (
  id bigserial primary key,
  username text not null,
  message text not null,
  created_at timestamp default now()
);
create index chat_created on chat_messages(created_at desc);

create table world_meta (
  key text primary key,
  value jsonb
);
```

5. Left sidebar → **Project Settings** → **API**. Copy these 2 values — you'll need them:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **service_role** key under "Project API keys" (⚠️ secret; never commit it)

> The `anon` key is not used by the server. Only `service_role` is needed because all DB calls go through the backend.

---

## 2. Run it locally (sanity check before deploying)

From the project root:

```bash
# Backend
cd backend
cp .env.example .env
# Open .env and fill in:
#   SUPABASE_URL=https://xxxxx.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=eyJ...(your service role key)
#   FRONTEND_ORIGIN=http://localhost:3000
npm install
npm run dev
```

In a **second terminal**:

```bash
cd frontend
cp .env.example .env
# Edit .env — for local dev:
#   NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
#   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=2477519f071cbdacd07cd615e323d413
npm install
npm run dev
```

Open http://localhost:3000 — enter a username, click **Enter World**. You should see a blue terrain. Open a second browser tab with a different username to verify multiplayer.

First boot takes ~15 seconds to generate the world (it's saved to Supabase after — subsequent boots load the existing world).

---

## 3. Push to GitHub

```bash
cd "path/to/based craft"
git init
git add .
git commit -m "Initial BaseCraft commit"
git branch -M main
git remote add origin https://github.com/sishirupretii/minecraft.git
git push -u origin main
```

If you get an auth prompt, GitHub now requires a **Personal Access Token** (not your password):
- https://github.com/settings/tokens → **Generate new token (classic)** → check `repo` → generate → copy
- Use the token as the "password" when prompted.

---

## 4. Deploy backend to Railway

1. https://railway.app/ → **New Project** → **Deploy from GitHub repo**.
2. If it's your first time, authorize Railway to see `sishirupretii/minecraft`.
3. Select the repo. After detection, click **Add variables** or go to the service → **Settings**.
4. **Settings → Source**:
   - **Root Directory**: `backend`
   - **Watch Paths**: `backend/**` (optional)
5. **Variables** tab — add:
   - `SUPABASE_URL` = `https://xxxxx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (your service role key)
   - `FRONTEND_ORIGIN` = (leave as `*` for now — we'll tighten after we have the Vercel URL)
   - `PORT` = `4000` (Railway usually injects its own PORT; our code respects either)
6. **Settings → Networking → Public Networking** → click **Generate Domain**. Copy the URL (e.g. `https://basecraft-backend-production.up.railway.app`).
7. Watch **Deployments** tab. First deploy takes 2–3 min. Logs should show:
   ```
   [world] Generating new world...
   [world] Generated ~XXXXX blocks.
   [basecraft] listening on :XXXX
   ```

If you see `Missing SUPABASE_URL`, fix the env vars and redeploy.

---

## 5. Deploy frontend to Vercel

1. https://vercel.com/new → **Import Git Repository** → pick `sishirupretii/minecraft`.
2. **Configure Project**:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `frontend`
   - **Build Command**: `next build` (default)
   - **Output Directory**: `.next` (default)
3. **Environment Variables**:
   - `NEXT_PUBLIC_BACKEND_URL` = (your Railway URL from step 4.6, e.g. `https://basecraft-backend-production.up.railway.app`)
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` = `2477519f071cbdacd07cd615e323d413`
4. **Deploy**. Takes ~2 min. Copy the live URL (e.g. `https://minecraft-xxx.vercel.app`).

---

## 6. Tighten CORS on Railway

1. Go back to Railway → your service → **Variables**.
2. Change `FRONTEND_ORIGIN` to your Vercel URL:
   ```
   FRONTEND_ORIGIN=https://minecraft-xxx.vercel.app
   ```
   You can add multiple comma-separated origins (no spaces):
   ```
   FRONTEND_ORIGIN=https://minecraft-xxx.vercel.app,http://localhost:3000
   ```
3. Redeploy (Railway auto-redeploys on variable change, or hit **Redeploy** manually).

---

## 7. Testing checklist

Open your Vercel URL in **two browser tabs** (use a private/incognito window for the second so they have separate usernames):

- [ ] Tab A enters as username "alice". Tab B connects a wallet and enters.
- [ ] Both see the blue world load.
- [ ] Both see each other's avatar (with username floating above).
- [ ] Tab A breaks a block → Tab B sees it disappear instantly.
- [ ] Tab B places a block → Tab A sees it appear instantly.
- [ ] Tab A presses T, types "hello", Enter → Tab B sees the message.
- [ ] Tab A types `/players` → sees the list.
- [ ] Tab A types `/tp alice` (using Tab B's username) → teleports.
- [ ] Refresh Tab A — world state persists (your placed block is still there).
- [ ] Kill the Railway service for 30s, restart — frontend shows "Disconnected… Reconnecting" and then reconnects automatically.

---

## 8. Troubleshooting

**"CORS error" in browser console**
Add your Vercel URL to `FRONTEND_ORIGIN` on Railway and redeploy. No trailing slash.

**Player stuck falling / no world appears**
Check Railway logs. Likely the server can't reach Supabase — re-verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

**Wallet button doesn't pop up**
Some ad-blockers break WalletConnect. Test in a clean browser profile.

**Slow world load**
First boot generates ~60k blocks and writes them all to Supabase — takes ~10–20s. After that it's near-instant.

**Want to regenerate the world**
In Supabase SQL editor, run:
```sql
truncate blocks;
delete from world_meta where key='generated';
```
Then restart the Railway service.

---

## 9. Controls reference

| Key            | Action                           |
|----------------|----------------------------------|
| W A S D        | Move                             |
| Space          | Jump / fly up (while flying)     |
| Shift          | Sprint / fly down                |
| Mouse          | Look                             |
| Left-click     | Break block                      |
| Right-click    | Place selected block             |
| 1–6 / scroll   | Switch block in hotbar           |
| T              | Open chat                        |
| Enter          | Send chat                        |
| Esc            | Close chat / release mouse       |
| F              | Toggle fly mode (creative)       |
| Tab (hold)     | Show player list                 |
| F3             | Toggle coordinate display        |

**Chat commands**: `/tp <user>`, `/spawn`, `/players`, `/help`
