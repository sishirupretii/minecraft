'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';

interface Props {
  onLogin: (username: string, wallet?: string, verifiedBase?: boolean, ethBalance?: bigint) => void;
}

function shortWallet(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Classic Minecraft-style splash texts. One is chosen per page load.
const SPLASHES = [
  'Also try Terraria!',
  'Now with pigs!',
  'Made in Three.js!',
  'Multiplayer!',
  'Voxels!',
  '100% blocky!',
  'Mine and craft!',
  'Base-powered!',
  'Flowers on grass!',
  'Free to break!',
];

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

  // Splash text is stable across the mount but random per visit.
  const splash = useMemo(
    () => SPLASHES[Math.floor(Math.random() * SPLASHES.length)],
    [],
  );

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
    onLogin(shortWallet(address), address, verifiedBase, balance?.value);
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Tiled dirt block background — classic Minecraft main menu. */}
      <div className="mc-dirt-bg absolute inset-0" />
      {/* Subtle vignette darken so the menu panel pops. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">
        {/* Title block */}
        <div className="mb-10 flex flex-col items-center">
          <div className="relative flex items-center">
            <h1 className="mc-title">BASEDCRAFT</h1>
            <span
              className="mc-splash absolute"
              style={{ right: '-22px', top: '8px' }}
            >
              {splash}
            </span>
          </div>
          <p
            className="mt-4 text-center"
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: '18px',
              color: 'rgba(255,255,255,0.75)',
              letterSpacing: '1px',
              textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
            }}
          >
            A multiplayer voxel world.
          </p>
        </div>

        {/* Menu panel */}
        <div className="bc-panel w-full max-w-md p-6">
          <div className="space-y-4">
            <div>
              <label
                className="mb-2 block"
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '9px',
                  letterSpacing: '1px',
                  color: 'rgba(255,255,255,0.8)',
                  textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
                }}
              >
                PLAYER NAME
              </label>
              <input
                className="bc-input"
                placeholder="Player123"
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
              style={{ padding: '14px 18px' }}
            >
              {loading ? 'LOADING WORLD...' : 'PLAY'}
            </button>

            {/* Divider, pixel-style */}
            <div className="flex items-center gap-3 py-1">
              <div className="h-[2px] flex-1 bg-black" style={{ boxShadow: '0 2px 0 #555' }} />
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '9px',
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                OR
              </span>
              <div className="h-[2px] flex-1 bg-black" style={{ boxShadow: '0 2px 0 #555' }} />
            </div>

            <div className="flex flex-col gap-2">
              {/*
                Custom Connect button — rendered as a stone `.bc-btn` so it
                matches the Minecraft menu aesthetic instead of RainbowKit's
                default pill. Tunnels into RainbowKit's modals for the actual
                wallet UI.
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
                        CONNECT WALLET
                      </button>
                    );
                  }
                  if (chain.unsupported) {
                    return (
                      <button
                        className="bc-btn w-full"
                        onClick={openChainModal}
                        disabled={loading}
                        style={{ backgroundColor: '#7a2a2a' }}
                      >
                        WRONG NETWORK
                      </button>
                    );
                  }
                  return (
                    <button
                      className="bc-btn bc-btn-dark w-full"
                      onClick={openAccountModal}
                      disabled={loading}
                    >
                      <span
                        className="mr-1 inline-block h-2 w-2 align-middle"
                        style={{ background: '#8bbf68', boxShadow: '0 0 0 1px #000' }}
                      />
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
                    {loading ? 'LOADING...' : `PLAY AS ${shortWallet(address).toUpperCase()}`}
                  </button>
                  {balanceLoading ? (
                    <div
                      style={{
                        fontFamily: "'VT323', monospace",
                        fontSize: '16px',
                        color: 'rgba(255,255,255,0.55)',
                        textAlign: 'center',
                      }}
                    >
                      Checking Base balance…
                    </div>
                  ) : verifiedBase ? (
                    <div
                      style={{
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: '9px',
                        color: '#b5e08c',
                        textAlign: 'center',
                        padding: '8px',
                        background: 'rgba(139, 191, 104, 0.1)',
                        border: '2px solid #5a8a3a',
                        textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
                      }}
                    >
                      ◆ VERIFIED BASE WALLET
                    </div>
                  ) : (
                    <div
                      style={{
                        fontFamily: "'VT323', monospace",
                        fontSize: '16px',
                        color: 'rgba(255,255,255,0.5)',
                        textAlign: 'center',
                      }}
                    >
                      Connect to Base to verify (optional)
                    </div>
                  )}
                </>
              )}
            </div>

            {error && (
              <div
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: '16px',
                  color: '#ff8888',
                  padding: '8px 10px',
                  background: 'rgba(255, 0, 0, 0.12)',
                  border: '2px solid #7a2a2a',
                  textShadow: '1px 1px 0 rgba(0,0,0,0.7)',
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer — pixel caption */}
        <div
          className="mt-6 text-center"
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '15px',
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '1px',
            textShadow: '1px 1px 0 rgba(0,0,0,0.7)',
          }}
        >
          WASD to move · SPACE to jump · CLICK to mine · RIGHT-CLICK to place
        </div>
        <div
          className="mt-2 text-center"
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '1px',
          }}
        >
          NOT AFFILIATED WITH MOJANG
        </div>
      </div>
    </div>
  );
}
