'use client';

import { ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

// Lazy-load wagmi + RainbowKit + our config AFTER mount. The underlying
// WalletConnect SDK touches indexedDB at module load, which the Vercel
// build's static prerender step does not have. Deferring the import until
// client mount avoids the prerender crash entirely without losing any
// wallet functionality — the user can't interact with wallets until the
// page has rendered anyway.
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const [ready, setReady] = useState<{
    WagmiProvider: any;
    RainbowKitProvider: any;
    darkTheme: any;
    wagmiConfig: any;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [w, rk, cfg] = await Promise.all([
        import('wagmi'),
        import('@rainbow-me/rainbowkit'),
        import('@/lib/wagmi'),
      ]);
      if (cancelled) return;
      setReady({
        WagmiProvider: w.WagmiProvider,
        RainbowKitProvider: rk.RainbowKitProvider,
        darkTheme: rk.darkTheme,
        wagmiConfig: cfg.wagmiConfig,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    // Show the same branded backdrop while wagmi initialises so the
    // page never flashes black.
    return (
      <div
        style={{
          minHeight: '100vh',
          background:
            'radial-gradient(ellipse at top, #0052ff22 0%, transparent 60%), linear-gradient(180deg, #0a0e27 0%, #040612 100%)',
        }}
      />
    );
  }

  const { WagmiProvider, RainbowKitProvider, darkTheme, wagmiConfig } = ready;
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#0052FF',
            accentColorForeground: 'white',
            borderRadius: 'medium',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
