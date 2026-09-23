// Network parameters from gokite-ai/kite-x402-services, Apache-2.0,
// commit 893a27509648b660bbba626b0da59619a94f04ab (see THIRD_PARTY_NOTICES.md).
import type { Config } from './config.js';

export const CHAINS = {
  mainnet: {
    network: 'eip155:2366' as const,
    asset: '0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e',
    decimals: 6, name: 'Bridged USDC (Kite AI)', symbol: 'USDC.e',
  },
  testnet: {
    network: 'eip155:2368' as const,
    asset: '0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A',
    decimals: 18, name: 'pieUSD', symbol: 'pieUSD',
  },
};

export function paymentPrice(config: Config) {
  const chain = CHAINS[config.network];
  const [whole, fraction = ''] = config.price.split('.');
  return {
    asset: chain.asset,
    amount: BigInt(whole + fraction.padEnd(chain.decimals, '0')).toString(),
    extra: { name: chain.name, version: '1', ...config.network === 'mainnet' ? { version: '2' } : {} },
  };
}
