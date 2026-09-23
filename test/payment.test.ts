import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { extractArticle } from '../src/extract.js';
import { ReaderError } from '../src/errors.js';
import { config, articleHtml, fakeFacilitator, fakePayment } from './helpers.js';

const path = '/v1/read?url=https%3A%2F%2Fexample.com%2Farticle';

for (const scenario of ['unpaid', 'invalid', 'success', 'extraction-failure', 'settlement-failure', 'invalid-url', 'blocked-url', 'methods', 'route-variants'] as const) {
  test(`payment integration: ${scenario}`, async t => {
    const events: string[] = [];
    const app = createApp(config, {
      facilitator: fakeFacilitator(events, { invalid: scenario === 'invalid', failSettlement: scenario === 'settlement-failure' }),
      reader: async url => {
        events.push('upstream');
        if (scenario === 'extraction-failure') throw new ReaderError(422, 'NO_ARTICLE', 'No article');
        return extractArticle({ url, html: articleHtml });
      },
    });
    const server = app.listen(0, '127.0.0.1');
    t.after(() => { server.closeAllConnections(); server.close(); });
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (scenario === 'methods') {
      for (const method of ['HEAD', 'POST', 'OPTIONS']) assert.equal((await fetch(base + path, { method })).status, 405);
      assert.deepEqual(events, []); return;
    }
    if (scenario === 'route-variants') {
      for (const variant of ['/V1/READ', '/v1/read/', '/v1/%72ead']) {
        const response = await fetch(base + variant + '?url=https://example.com');
        assert.ok([402, 404].includes(response.status));
      }
      assert.deepEqual(events, []); return;
    }
    if (scenario === 'unpaid') {
      const response = await fetch(base + path);
      assert.equal(response.status, 402);
      const required = JSON.parse(Buffer.from(response.headers.get('payment-required')!, 'base64').toString());
      assert.equal(required.accepts[0].amount, '1000000000000000');
      assert.equal(required.accepts[0].network, 'eip155:2368');
      assert.equal(required.accepts[0].payTo, config.payTo);
      assert.deepEqual(events, []);
      assert.equal((await fetch(base + '/healthz')).status, 200);
      assert.equal((await fetch(base + '/.well-known/reader.json')).status, 200);
      return;
    }
    const target = scenario === 'invalid-url' ? '/v1/read' : scenario === 'blocked-url' ? '/v1/read?url=http://127.0.0.1' : path;
    const signature = await fakePayment(base, target);
    const response = await fetch(base + target, { headers: { 'PAYMENT-SIGNATURE': signature }, signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    if (scenario === 'invalid') {
      assert.equal(response.status, 402); assert.deepEqual(events, ['verify']);
    } else if (scenario === 'extraction-failure') {
      assert.equal(response.status, 422); assert.deepEqual(events, ['verify', 'upstream']);
      assert.equal(response.headers.get('payment-response'), null);
    } else if (scenario === 'invalid-url' || scenario === 'blocked-url') {
      assert.equal(response.status, 400); assert.deepEqual(events, ['verify']);
    } else if (scenario === 'settlement-failure') {
      assert.equal(response.status, 402); assert.equal(body.markdown, undefined);
      assert.deepEqual(events, ['verify', 'upstream', 'settle']);
    } else {
      assert.equal(response.status, 200); assert.match(body.markdown, /AI agents/);
      const settlement = JSON.parse(Buffer.from(response.headers.get('payment-response')!, 'base64').toString());
      assert.equal(settlement.success, true);
      assert.deepEqual(events, ['verify', 'upstream', 'settle']);
      assert.match(response.headers.get('cache-control')!, /no-store/);
    }
  });
}
