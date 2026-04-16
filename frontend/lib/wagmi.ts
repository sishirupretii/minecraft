import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';
import { http } from 'viem';

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '2477519f071cbdacd07cd615e323d413';

export const wagmiConfig = getDefaultConfig({
  appName: 'BaseCraft',
  projectId,
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});
