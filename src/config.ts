export interface Config {
  payTo: string;
  network: 'mainnet' | 'testnet';
  price: string;
  port: number;
  facilitatorUrl: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const payTo = env.PAY_TO?.trim() ?? '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo) || /^0x0{40}$/.test(payTo)) {
    throw new Error('PAY_TO must be your non-zero EVM receiving address (no private key needed)');
  }
  const network = env.KITE_NETWORK ?? 'testnet';
  if (network !== 'mainnet' && network !== 'testnet') throw new Error('Invalid KITE_NETWORK');
  const price = env.PRICE_USD ?? '0.001';
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(price) || Number(price) <= 0) {
    throw new Error('PRICE_USD must be a positive decimal with at most 6 fractional digits');
  }
  const port = Number(env.PORT ?? '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const facilitatorUrl = env.FACILITATOR_URL ?? 'https://facilitator.pieverse.io/v2';
  if (new URL(facilitatorUrl).protocol !== 'https:') throw new Error('Facilitator must use HTTPS');
  return { payTo, network, price, port, facilitatorUrl };
}
