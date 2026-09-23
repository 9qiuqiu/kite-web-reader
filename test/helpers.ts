import type { FacilitatorClient } from '@x402/core/server';
import { readConfig } from '../src/config.js';
import { CHAINS } from '../src/kite.js';

export const config = readConfig({ PAY_TO: '0x1111111111111111111111111111111111111111' });
export const articleHtml = `<!doctype html><html lang="en"><head><title>A readable article</title></head><body>
<nav>Navigation menu</nav><article><h1>A readable article</h1>
${Array.from({length: 5}, (_, i) => `<p>Paragraph ${i}: AI agents need reliable access to public information. This article explains how to retrieve useful text, preserve source links, and handle payment only after the requested work has completed successfully.</p>`).join('')}
<p><a href="/source">Original source</a></p><script>throw new Error('must never execute')</script>
</article></body></html>`;

export function fakeFacilitator(events: string[], options: { invalid?: boolean; failSettlement?: boolean } = {}): FacilitatorClient {
  return {
    async getSupported() { return { kinds: [{ x402Version: 2, scheme: 'exact', network: CHAINS.testnet.network }], extensions: [], signers: {} }; },
    async verify() { events.push('verify'); return { isValid: !options.invalid, ...options.invalid ? { invalidReason: 'invalid_signature' } : {} }; },
    async settle() {
      events.push('settle');
      return { success: !options.failSettlement, transaction: options.failSettlement ? '' : '0x' + 'a'.repeat(64), network: CHAINS.testnet.network,
        ...options.failSettlement ? { errorReason: 'insufficient_funds' } : {} };
    },
  };
}

export async function fakePayment(base: string, path: string) {
  const challenge = await fetch(base + path);
  const required = JSON.parse(Buffer.from(challenge.headers.get('payment-required')!, 'base64').toString());
  return Buffer.from(JSON.stringify({ x402Version: 2, resource: required.resource, accepted: required.accepts[0],
    payload: { signature: '0x' + 'b'.repeat(130), authorization: {
      from: '0x2222222222222222222222222222222222222222', to: config.payTo,
      value: required.accepts[0].amount, validAfter: '0', validBefore: '9999999999', nonce: '0x' + 'c'.repeat(64),
    } },
  })).toString('base64');
}
