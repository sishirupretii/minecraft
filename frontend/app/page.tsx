'use client';

// Skip the Node-side static prerender for this route. wagmi/RainbowKit pulls
// in WalletConnect, which touches indexedDB at module load — something that
// doesn't exist in the Vercel build sandbox and used to crash prerender.
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import dynamicImport from 'next/dynamic';
import LoginScreen from '@/components/LoginScreen';

// Game is Three.js-heavy and browser-only. Keep it out of the server bundle.
const Game = dynamicImport(() => import('@/components/Game'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0e27] text-white/80">
      Loading game…
    </div>
  ),
});

interface Session {
  username: string;
  wallet?: string;
  verifiedBase?: boolean;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  if (!session) {
    return (
      <LoginScreen
        onLogin={(u, w, v) => setSession({ username: u, wallet: w, verifiedBase: v })}
      />
    );
  }
  return (
    <Game
      username={session.username}
      walletAddress={session.wallet}
      verifiedBase={session.verifiedBase}
    />
  );
}
