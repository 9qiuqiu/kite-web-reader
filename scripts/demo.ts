// Offline demonstration: REAL x402 middleware, FAKE facilitator and fixture HTML.
// No blockchain transaction or real signature is created by this script.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { extractArticle } from '../src/extract.js';
import { ReaderError } from '../src/errors.js';
import { config, articleHtml, fakeFacilitator, fakePayment } from '../test/helpers.js';

const events: string[] = [];
const app = createApp(config, {
  facilitator: fakeFacilitator(events),
  reader: async url => {
    events.push('upstream');
    if (url.endsWith('/empty')) throw new ReaderError(422, 'NO_ARTICLE', 'No readable article');
    return extractArticle({ url, html: articleHtml });
  },
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
try {
  const path = '/v1/read?url=https://example.com/article';
  const unpaid = await fetch(base + path);
  assert.equal(unpaid.status, 402);
  const signature = await fakePayment(base, path);
  const paid = await fetch(base + path, { headers: { 'PAYMENT-SIGNATURE': signature } });
  const article = await paid.json();
  assert.equal(paid.status, 200);
  assert.deepEqual(events, ['verify', 'upstream', 'settle']);
  const successOrder = [...events];
  events.length = 0;
  const failurePath = '/v1/read?url=https://example.com/empty';
  const failureSignature = await fakePayment(base, failurePath);
  const failed = await fetch(base + failurePath, { headers: { 'PAYMENT-SIGNATURE': failureSignature } });
  assert.equal(failed.status, 422);
  assert.deepEqual(events, ['verify', 'upstream']);
  console.log(JSON.stringify({
    mode: 'OFFLINE_SIMULATION_NO_ONCHAIN_TRANSACTION',
    unpaidStatus: unpaid.status,
    paidStatus: paid.status, successOrder,
    title: article.title, markdownPreview: article.markdown.slice(0, 240),
    failedExtractionStatus: failed.status, failureOrder: events,
    settledOnExtractionFailure: events.includes('settle'),
  }, null, 2));
} finally { server.closeAllConnections(); server.close(); }
