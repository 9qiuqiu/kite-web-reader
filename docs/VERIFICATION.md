# Verification record

Date: 2026-09-23. Local runtime: Node.js v24.12.0, npm 11.6.2.

## Automated verification

`npm run check` runs TypeScript checking, 21 behavioral tests and production
compilation. Tests cover real x402 Express middleware with a simulated
facilitator, article extraction, SSRF/DNS/redirect restrictions, bounded
downloads, timeouts, integer pricing and the native HTTP transport's pinned-IP
connection behavior. They do not prove on-chain settlement.

`npm run demo` was executed successfully and reported:

```json
{
  "mode": "OFFLINE_SIMULATION_NO_ONCHAIN_TRANSACTION",
  "unpaidStatus": 402,
  "paidStatus": 200,
  "successOrder": ["verify", "upstream", "settle"],
  "failedExtractionStatus": 422,
  "failureOrder": ["verify", "upstream"],
  "settledOnExtractionFailure": false
}
```

Dependency installation reported 0 known vulnerabilities at verification time.

## Read-only live checks

- `https://facilitator.pieverse.io/v2/supported` returned support for x402 v2
  `exact` on `eip155:2368` and `eip155:2366`.
- The built service, using the **real HTTP facilitator client**, returned 402
  for an unsigned request. Its challenge specified testnet pieUSD,
  amount `1000000000000000` ($0.001 at 18 decimals), and EIP-712 name/version
  `pieUSD` / `1`. A dummy recipient was used for this unsigned check only;
  no signature, authorization or payment was made.
- A real IANA article fetch was attempted. This workstation's DNS resolved
  `www.iana.org` to `198.18.1.92` (a non-public benchmarking address), and the
  reader correctly refused it with `BLOCKED_ADDRESS`. The security policy was
  not weakened. Public-network extraction remains to be smoke-tested on a
  host with public DNS answers. Fixture extraction and native HTTP transport
  are tested independently.

## Not verified / not performed

- Public HTTPS deployment.
- Real signed testnet or mainnet payment and transaction hash.
- Docker build (Docker unavailable on this workstation).
- GitHub Actions execution; tests are runnable locally with `npm run check`.
- Official Kite catalog registration or bounty dashboard submission.

No simulated signature or transaction is presented as real chain evidence.
