import express, { type ErrorRequestHandler } from 'express';
import { HTTPFacilitatorClient, type FacilitatorClient } from '@x402/core/server';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import type { Config } from './config.js';
import { CHAINS, paymentPrice } from './kite.js';
import { readArticle } from './extract.js';
import { validateUrl } from './fetch-page.js';
import { ReaderError } from './errors.js';

export function createApp(config: Config, dependencies: {
  facilitator?: FacilitatorClient;
  reader?: typeof readArticle;
} = {}) {
  const chain = CHAINS[config.network];
  const facilitator = dependencies.facilitator ?? new HTTPFacilitatorClient({ url: config.facilitatorUrl, timeoutMs: 15_000 });
  const server = new x402ResourceServer(facilitator).register(chain.network, new ExactEvmScheme());
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('case sensitive routing', true);
  app.set('strict routing', true);
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'kite-web-reader', network: chain.network }));
  app.get('/', (_req, res) => res.json({
    name: 'Kite Web Reader', version: '0.1.0',
    description: 'Extract public HTML articles as text and Markdown, paid per request with x402.',
    endpoint: 'GET /v1/read?url=https%3A%2F%2Fexample.com%2Farticle',
    discovery: '/.well-known/reader.json', documentation: 'https://github.com/zhengqiuwan/kite-web-reader',
  }));
  app.get('/.well-known/reader.json', (_req, res) => res.json({
    name: 'kite-web-reader', x402Version: 2,
    endpoints: [{ method: 'GET', path: '/v1/read', query: { url: 'Absolute public HTTP(S) article URL' },
      priceUsd: config.price, network: chain.network, ...paymentPrice(config), payTo: config.payTo }],
    limits: { maxBytes: 2097152, fetchTimeoutMs: 10000, redirects: 3 },
  }));
  // Express implicitly routes HEAD to GET. Reject it before the payment gate,
  // otherwise a HEAD request could execute the reader without payment.
  app.all('/v1/read', (req, res, next) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
      return;
    }
    next();
  });
  let active = 0;
  app.use('/v1/read', (_req, res, next) => {
    if (active >= 8) { res.status(503).json({ error: 'BUSY', message: 'Retry later' }); return; }
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release);
    res.once('close', release);
    next();
  });
  app.use(paymentMiddleware({
    'GET /v1/read': {
      accepts: { scheme: 'exact', network: chain.network, price: paymentPrice(config), payTo: config.payTo, maxTimeoutSeconds: 60 },
      description: 'Extract one public HTML article into text and Markdown', mimeType: 'application/json',
    },
  }, server));
  app.get('/v1/read', async (req, res) => {
    const input = req.query.url;
    if (typeof input !== 'string') throw new ReaderError(400, 'INVALID_URL', 'Provide exactly one url query parameter');
    validateUrl(input);
    const article = await (dependencies.reader ?? readArticle)(input);
    res.json(article);
  });
  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) { res.end(); return; }
    if (error instanceof ReaderError) {
      res.status(error.status).json({ error: error.code, message: error.message });
    } else {
      res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' });
    }
  };
  app.use(errorHandler);
  return app;
}
