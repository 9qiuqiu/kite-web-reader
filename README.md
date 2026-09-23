# Kite Web Reader

**Public web articles → clean text + Markdown, paid per request with Kite x402.**

[中文说明](docs/README.zh-CN.md) · [Submission notes](docs/SUBMISSION.md) · [Verification](docs/VERIFICATION.md)

An `x402-service` project for AI agents that need readable source material.
The service retrieves a public HTML page, extracts its article, and returns its
title, byline, language, excerpt, plain text, Markdown and final source URL.
No LLM API key or browser runtime is required.

**Status: source-code MVP / not deployed.** Payment middleware is tested with a
simulated facilitator. No real testnet settlement is claimed. Supply your public
receiving address and complete the testnet checklist before treating this as a
live service or submitting it to the official service catalog.

## Payment flow

```text
GET /v1/read?url=...               → 402 + PAYMENT-REQUIRED
Retry with PAYMENT-SIGNATURE      → facilitator verifies authorization
                                 → fetch and extract article
                                 → facilitator settles payment
                                 → 200 JSON + PAYMENT-RESPONSE
Fetch/extraction error            → error JSON; no settlement attempted
Settlement rejected              → payment error; article withheld
```

Uses the real `@x402/express` middleware and EVM exact scheme. Testnet pieUSD is
the default; mainnet USDC.e is opt-in. Default price is `$0.001` per successful
request. Amounts are built with integer arithmetic using the correct decimals
and EIP-712 domains. There is no mock-payment environment switch in production.

## Quick start

Requires Node.js 22+ (validated locally on Node 24).

```sh
npm ci
cp .env.example .env
# Set PAY_TO in .env to YOUR non-zero EVM receiving address.
npm run build
npm start
```

```sh
curl http://localhost:8080/healthz
curl http://localhost:8080/.well-known/reader.json
curl -i --get http://localhost:8080/v1/read \
  --data-urlencode 'url=https://www.iana.org/help/example-domains'
# Expect 402 and PAYMENT-REQUIRED when the facilitator is reachable.
```

`/healthz` is a process liveness check, not confirmation of facilitator readiness.
`/.well-known/reader.json` is this project's own discovery descriptor, not an
official catalog registration. Only `GET /v1/read` is paid. Other methods,
including HEAD, are rejected; unknown endpoints return 404.

## Verify without a wallet

```sh
npm run check   # type check, behavioral tests, production build
npm run demo    # offline payment lifecycle demonstration
```

The tests use actual HTTP requests through the x402 middleware, with a fake
facilitator and article fixture. They check ordering, rejected payments, no
settlement on extraction failure, withheld content on settlement failure,
route bypasses, SSRF restrictions, size limits, timeout and extraction behavior.
The demo does **not** generate real payment signatures or transactions.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAY_TO` | required | Public EVM receiving address; never a private key |
| `KITE_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `PRICE_USD` | `0.001` | Positive decimal, at most 6 fractional digits |
| `PORT` | `8080` | HTTP port |
| `FACILITATOR_URL` | `https://facilitator.pieverse.io/v2` | Verification and settlement facilitator |

Unlike a generic wrapper, extraction runs in this service; there is no
`UPSTREAM_URL` or upstream API credential. Buyer payment headers and cookies are
never forwarded to websites.

## Limits and trust boundaries

- Public HTTP(S) pages on default ports only; no URL credentials.
- Every DNS answer and redirect is checked. The actual connection is pinned to
  a validated public IP while preserving the original TLS hostname.
- 2 MiB maximum HTML body, 10-second fetch deadline including DNS and redirects,
  at most 3 redirects, 30,000 DOM elements, and 8 active endpoint requests.
- HTML only; compressed responses, unsupported encodings and very short pages
  are rejected. Sites must honor `Accept-Encoding: identity`. UTF-8 is assumed
  when no HTTP charset is supplied.
- No JavaScript rendering, login, paywall bypass, PDF or batch extraction yet.
- Source text is untrusted: it may contain misleading instructions or unsafe
  links. Agent consumers must treat it as data and safely render Markdown.
- HTML parsing is synchronous and bounded by size/element limits, not a hard
  CPU deadline. Internet-scale deployment should add worker isolation and
  gateway rate limits. No automatic robots.txt policy is implemented; callers
  and operators must use sources they are allowed to retrieve.
- A settlement timeout may have an indeterminate on-chain outcome. Check the
  payer's transaction history before retrying with a new payment authorization.
  This MVP does not persist responses or provide paid-request replay recovery.

## Deploy and test on Kite

```sh
docker build -t kite-web-reader .
docker run --rm -p 8080:8080 --env-file .env kite-web-reader
```

Use a public HTTPS host reachable by Kite Passport. Docker configuration is
provided; see verification notes for what was actually run.

Follow the [official Kite testnet instructions](https://github.com/gokite-ai/kite-x402-services#test-with-a-kite-passport-agent):

1. Configure your own `PAY_TO`, `KITE_NETWORK=testnet`, and deploy.
2. Log into `kpass`, enable sandbox, and obtain testnet pieUSD from its faucet.
3. Register an agent, create a small-budget session and approve it with your
   passkey. These are wallet/account actions; they are not automated here.
4. Execute `GET https://YOUR-HOST/v1/read?url=ENCODED_ARTICLE_URL` with the agent.
5. Preserve the real 200 response and settlement transaction hash; then test
   extraction failure and confirm that no settlement occurred.
6. Fill the deployment evidence in `docs/SUBMISSION.md`. Generate an official
   catalog manifest from actual host, wallet and successful request evidence
   if you also intend to contribute to the upstream catalog.

## Roadmap

- Week 1: HTML extraction, x402 lifecycle, security limits and reproducible tests.
- Week 2: More extraction fixtures, multilingual quality and worker isolation.
- Week 3: Bounded PDF text extraction with format-specific pricing.
- Week 4: Reliability metrics and paid-request result recovery.

Continue iterating in this same repository for subsequent bounty weeks.

## Attribution

Apache-2.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the official
Kite template and network metadata attribution. This is a community project.
