'use client';

import { useState } from 'react';
import LoginScreen from '@/components/LoginScreen';
import Game from '@/components/Game';

export default function Home() {
  const [session, setSession] = useState<{ username: string; wallet?: string } | null>(null);

  if (!session) {
    return <LoginScreen onLogin={(username, wallet) => setSession({ username, wallet })} />;
  }

  return <Game username={session.username} walletAddress={session.wallet} />;
}
