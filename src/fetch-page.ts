import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { ReaderError } from './errors.js';

export const MAX_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 3;

export function isPublicAddress(address: string): boolean {
  try {
    // process() converts IPv4-mapped IPv6 before checking its range.
    return ipaddr.process(address).range() === 'unicast';
  } catch { return false; }
}

export function validateUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch {
    throw new ReaderError(400, 'INVALID_URL', 'Provide an absolute HTTP or HTTPS URL');
  }
  if (input.length > 4096 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new ReaderError(400, 'INVALID_URL', 'Only HTTP(S), default ports, and URLs without credentials are allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      (ipaddr.isValid(host) && !isPublicAddress(host))) {
    throw new ReaderError(400, 'BLOCKED_ADDRESS', 'Only public internet addresses are allowed');
  }
  url.hash = '';
  return url;
}

export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
export async function resolvePublic(url: URL, resolver: Resolver = host => lookup(host, { all: true })) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: Awaited<ReturnType<Resolver>>;
  try { addresses = await resolver(host); } catch {
    throw new ReaderError(502, 'DNS_FAILED', 'Could not resolve the requested website');
  }
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) {
    throw new ReaderError(400, 'BLOCKED_ADDRESS', 'Website resolves to a non-public address');
  }
  return addresses[0];
}

export interface Page { html: string; url: string }

// Dependency injection is only for deterministic transport tests, not an environment bypass.
export interface TransportResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: AsyncIterable<Uint8Array>;
  destroy: () => void;
}
export type Transport = (url: URL, address: { address: string; family: number }, signal: AbortSignal) => Promise<TransportResponse>;

export const requestPinned: Transport = (url, address, signal) => new Promise((resolve, reject) => {
  const options: http.RequestOptions & { autoSelectFamily: boolean } = {
    signal,
    agent: false,
    // Keep original Host and TLS SNI; pin the socket to the checked DNS answer.
    lookup: (_host, _options, callback) => callback(null, address.address, address.family),
    autoSelectFamily: false,
    headers: {
      'User-Agent': 'KiteWebReader/0.1 (+https://github.com/zhengqiuwan/kite-web-reader)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Encoding': 'identity',
    },
  };
  const request = (url.protocol === 'https:' ? https : http).get(url, options, response => resolve({
    status: response.statusCode ?? 502, headers: response.headers,
    body: response, destroy: () => response.destroy(),
  }));
  request.on('error', reject);
});

export async function fetchPage(input: string, options: {
  resolver?: Resolver; transport?: Transport; timeoutMs?: number; maxBytes?: number;
} = {}): Promise<Page> {
  const signal = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
  const operation = async () => {
    let url = validateUrl(input);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const address = await resolvePublic(url, options.resolver);
      signal.throwIfAborted();
      const response = await (options.transport ?? requestPinned)(url, address, signal);
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.headers.location || hop === MAX_REDIRECTS) {
            throw new ReaderError(502, 'REDIRECT_LIMIT', 'Missing redirect target or too many redirects');
          }
          url = validateUrl(new URL(response.headers.location, url).href);
          continue;
        }
        if (response.status < 200 || response.status >= 300) {
          throw new ReaderError(502, 'UPSTREAM_ERROR', `Website returned HTTP ${response.status}`);
        }
        if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(response.headers['content-type'] ?? '')) {
          throw new ReaderError(415, 'UNSUPPORTED_CONTENT', 'Only HTML articles are supported');
        }
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
          throw new ReaderError(415, 'UNSUPPORTED_ENCODING', 'Website must support uncompressed HTML');
        }
        const maxBytes = options.maxBytes ?? MAX_BYTES;
        if (Number(response.headers['content-length']) > maxBytes) {
          throw new ReaderError(413, 'PAGE_TOO_LARGE', 'Page exceeds the size limit');
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          signal.throwIfAborted();
          bytes += chunk.length;
          if (bytes > maxBytes) throw new ReaderError(413, 'PAGE_TOO_LARGE', 'Page exceeds the size limit');
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const charset = /charset=["']?([^\s;"']+)/i.exec(response.headers['content-type'] ?? '')?.[1] ?? 'utf-8';
        let html: string;
        try { html = new TextDecoder(charset).decode(buffer); } catch {
          throw new ReaderError(415, 'UNSUPPORTED_CHARSET', 'Unsupported character encoding');
        }
        return { html, url: url.href };
      } finally { response.destroy(); }
    }
    throw new ReaderError(502, 'REDIRECT_LIMIT', 'Too many redirects');
  };
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new ReaderError(504, 'FETCH_TIMEOUT', 'Website took too long to respond'));
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } catch (error) {
    if (signal.aborted) throw new ReaderError(504, 'FETCH_TIMEOUT', 'Website took too long to respond');
    if (error instanceof ReaderError) throw error;
    throw new ReaderError(502, 'FETCH_FAILED', 'Unable to retrieve the website');
  } finally { signal.removeEventListener('abort', onAbort); }
}
