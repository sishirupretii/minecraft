'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

interface Props {
  onLogin: (username: string, wallet?: string) => void;
}

function shortWallet(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (isConnected && address) {
      setError(null);
    }
  }, [isConnected, address]);

  function handleUsernameLogin() {
    setError(null);
    const trimmed = username.trim();
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(trimmed)) {
      setError('Username must be 3–16 chars (letters, numbers, underscore).');
      return;
    }
    setLoading(true);
    onLogin(trimmed);
  }

  function handleWalletLogin() {
    if (!address) {
      setError('Connect your wallet first.');
      return;
    }
    setLoading(true);
    onLogin(shortWallet(address), address);
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Animated gradient backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at top, #0052ff22 0%, transparent 60%), linear-gradient(180deg, #0a0e27 0%, #040612 100%)',
        }}
      />
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,82,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,82,255,0.4) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {/* Parallax dot field — 40 slow-drifting specks for atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 40 }).map((_, i) => {
          const size = 1 + Math.random() * 2;
          return (
            <span
              key={i}
              className="login-dot"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * -24}s`,
                animationDuration: `${18 + Math.random() * 16}s`,
              }}
            />
          );
        })}
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="bc-panel w-full max-w-md p-8 shadow-glow">
          <div className="mb-8 text-center">
            <h1
              className="text-5xl font-extrabold tracking-tight"
              style={{
                color: '#0052FF',
                textShadow: '0 0 24px rgba(0, 82, 255, 0.6)',
              }}
            >
              BaseCraft
            </h1>
            <p className="mt-2 text-sm text-white/60">
              A multiplayer voxel world, built on Base.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/70">
                Username
              </label>
              <input
                className="bc-input"
                placeholder="e.g. satoshi_42"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={16}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUsernameLogin();
                }}
                disabled={loading}
              />
            </div>
            <button
              className="bc-btn w-full"
              onClick={handleUsernameLogin}
              disabled={loading || !username.trim()}
            >
              {loading ? 'Entering BaseCraft…' : 'Enter World'}
            </button>

            <div className="relative py-2 text-center text-xs text-white/40">
              <span className="relative z-10 bg-[#0a0e27] px-3">or</span>
              <div className="absolute left-0 right-0 top-1/2 -z-0 h-px bg-white/10" />
            </div>

            <div className="flex flex-col gap-2">
              <ConnectButton
                accountStatus="address"
                chainStatus="icon"
                showBalance={false}
              />
              {isConnected && address && (
                <button
                  className="bc-btn w-full"
                  onClick={handleWalletLogin}
                  disabled={loading}
                >
                  {loading ? 'Entering BaseCraft…' : `Enter as ${shortWallet(address)}`}
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="mt-8 text-center text-[11px] text-white/30">
            WASD to move · Space to jump · Click to break · Right-click to place
          </div>
        </div>
      </div>
    </div>
  );
}
