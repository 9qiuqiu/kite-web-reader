import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import { once } from 'node:events';
import { fetchPage, validateUrl, resolvePublic, isPublicAddress, requestPinned, type Transport } from '../src/fetch-page.js';
import { extractArticle } from '../src/extract.js';
import { readConfig } from '../src/config.js';
import { paymentPrice } from '../src/kite.js';
import { config, articleHtml } from './helpers.js';

test('extract article without scripts, preserve title and absolute links', () => {
  const result = extractArticle({ html: articleHtml, url: 'https://example.com/article' });
  assert.equal(result.title, 'A readable article');
  assert.match(result.markdown, /https:\/\/example.com\/source/);
  assert.doesNotMatch(result.markdown, /must never execute|Navigation menu/);
  assert.ok(result.characters > 120);
});
test('empty pages do not produce billable content', () => {
  assert.throws(() => extractArticle({ html: '<html><body>Empty</body></html>', url: 'https://example.com' }), { code: 'NO_ARTICLE' });
});
test('reject dangerous URL forms', () => {
  for (const url of ['file:///etc/passwd', 'http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://169.254.169.254', 'http://10.0.0.1', 'http://localhost.', 'https://example.com:8443', 'https://user:pass@example.com']) {
    // Trailing-dot localhost is rejected at DNS resolution, below.
    if (url === 'http://localhost.') continue;
    assert.throws(() => validateUrl(url), undefined, url);
  }
});
test('block private, reserved, mapped, multicast and link-local addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '100.64.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('93.184.216.34'), true);
});
test('DNS checks all answers including mixed public/private and trailing-dot localhost', async () => {
  await assert.rejects(resolvePublic(new URL('https://example.com'), async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]), { code: 'BLOCKED_ADDRESS' });
  await assert.rejects(resolvePublic(new URL('http://localhost.'), async () => [{ address: '127.0.0.1', family: 4 }]), { code: 'BLOCKED_ADDRESS' });
});
const resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const transport = (status: number, headers: Record<string, string>, text = articleHtml): Transport => async () => ({
  status, headers, body: (async function* () { yield Buffer.from(text); })(), destroy() {},
});
test('fetch pins a validated DNS address and reads HTML', async () => {
  const page = await fetchPage('https://example.com/article', { resolver, transport: async (url, address, signal) => {
    assert.equal(address.address, '93.184.216.34');
    return transport(200, { 'content-type': 'text/html' })(url, address, signal);
  } });
  assert.equal(page.html, articleHtml);
});
test('revalidates every redirect destination', async () => {
  await assert.rejects(fetchPage('https://example.com', { resolver, transport: transport(302, { location: 'http://169.254.169.254/latest/meta-data' }) }), { code: 'BLOCKED_ADDRESS' });
  await assert.rejects(fetchPage('https://example.com', { resolver, transport: transport(302, { location: '/loop' }) }), { code: 'REDIRECT_LIMIT' });
});
test('rejects excessive content including chunked bodies', async () => {
  await assert.rejects(fetchPage('https://example.com', { resolver, maxBytes: 10, transport: transport(200, { 'content-type': 'text/html' }) }), { code: 'PAGE_TOO_LARGE' });
  await assert.rejects(fetchPage('https://example.com', { resolver, transport: transport(200, { 'content-type': 'text/html', 'content-length': '9999999' }) }), { code: 'PAGE_TOO_LARGE' });
});
test('rejects non-HTML, compressed data and upstream errors', async () => {
  for (const [status, headers, code] of [
    [200, { 'content-type': 'application/pdf' }, 'UNSUPPORTED_CONTENT'],
    [200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }, 'UNSUPPORTED_ENCODING'],
    [403, {}, 'UPSTREAM_ERROR'],
  ] as const) await assert.rejects(fetchPage('https://example.com', { resolver, transport: transport(status, headers) }), { code });
});
test('deadline also covers stalled DNS', async () => {
  await assert.rejects(fetchPage('https://example.com', { timeoutMs: 5, resolver: async () => { await delay(30); return resolver(); }, transport: transport(200, { 'content-type': 'text/html' }) }), { code: 'FETCH_TIMEOUT' });
});
test('configuration rejects missing wallet, zero prices and excessive precision', () => {
  assert.throws(() => readConfig({}));
  for (const price of ['0', '-1', '0.0000001', '1e-3']) assert.throws(() => readConfig({ PAY_TO: config.payTo, PRICE_USD: price }));
  assert.equal(paymentPrice(config).amount, '1000000000000000');
  assert.equal(paymentPrice({ ...config, network: 'mainnet' }).amount, '1000');
  assert.equal(paymentPrice({ ...config, network: 'mainnet' }).extra.version, '2');
});

test('native transport uses pinned IP, preserves Host and sends no payment or cookie headers', async t => {
  const server = http.createServer((req, res) => {
    assert.match(req.headers.host!, /^unresolvable\.invalid:/);
    assert.equal(req.headers['payment-signature'], undefined);
    assert.equal(req.headers.cookie, undefined);
    res.setHeader('Content-Type', 'text/html');
    res.end(articleHtml);
  }).listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  // Only this low-level transport test supplies loopback. fetchPage always validates it first.
  const response = await requestPinned(new URL(`http://unresolvable.invalid:${port}/`), { address: '127.0.0.1', family: 4 }, AbortSignal.timeout(2000));
  const chunks: Buffer[] = [];
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
  response.destroy();
  assert.equal(response.status, 200);
  assert.equal(Buffer.concat(chunks).toString(), articleHtml);
});
