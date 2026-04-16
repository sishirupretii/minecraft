'use client';

import { useState, useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';

interface Props {
  onLogin: (username: string, wallet?: string, verifiedBase?: boolean) => void;
}

function shortWallet(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { address, isConnected } = useAccount();
  // Query Base-mainnet ETH balance only when a wallet is connected. Cheap,
  // read-only, no gas. Purely used to flag the account as "seen on Base".
  const { data: balance, isLoading: balanceLoading } = useBalance({
    address,
    chainId: base.id,
    query: { enabled: !!address },
  });
  const verifiedBase = !!balance && balance.value > 0n;

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
    onLogin(shortWallet(address), address, verifiedBase);
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Animated Base-blue backdrop — matches agentcraft.fun */}
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
      {/* Parallax dot field */}
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
              {/*
                Custom Connect button — the default RainbowKit button shows a
                grey pill that clashes with the agentcraft.fun look. We render
                our own full-width blue `.bc-btn` that tunnels into the same
                RainbowKit modals.
              */}
              <ConnectButton.Custom>
                {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
                  const ready = mounted;
                  const connected = ready && account && chain;
                  if (!connected) {
                    return (
                      <button
                        className="bc-btn w-full"
                        onClick={openConnectModal}
                        disabled={loading}
                      >
                        Connect Wallet
                      </button>
                    );
                  }
                  if (chain.unsupported) {
                    return (
                      <button
                        className="bc-btn w-full"
                        onClick={openChainModal}
                        disabled={loading}
                        style={{ background: '#7a2a2a' }}
                      >
                        Wrong Network — Switch
                      </button>
                    );
                  }
                  return (
                    <button
                      className="bc-btn w-full"
                      onClick={openAccountModal}
                      disabled={loading}
                      style={{
                        background:
                          'linear-gradient(180deg, #14204a 0%, #0b1332 100%)',
                      }}
                    >
                      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#4a7cff] align-middle" />
                      {account.displayName}
                    </button>
                  );
                }}
              </ConnectButton.Custom>
              {isConnected && address && (
                <>
                  <button
                    className="bc-btn w-full"
                    onClick={handleWalletLogin}
                    disabled={loading}
                  >
                    {loading ? 'Entering BaseCraft…' : `Enter as ${shortWallet(address)}`}
                  </button>
                  {balanceLoading ? (
                    <div className="text-center text-xs text-white/40">
                      Checking Base balance…
                    </div>
                  ) : verifiedBase ? (
                    <div className="rounded-md border border-[#8bbf68]/40 bg-[#8bbf68]/10 px-3 py-1.5 text-center text-xs text-[#b5e08c]">
                      ⬢ Verified Base wallet
                    </div>
                  ) : (
                    <div className="text-center text-xs text-white/40">
                      Connect to Base to verify (optional)
                    </div>
                  )}
                </>
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
