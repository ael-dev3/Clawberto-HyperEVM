# Trace HyperEVM Wallet Research Summary

Date: 2026-02-20

## Goal

Define a reliable read-only workflow to investigate HyperEVM wallet history and determine likely sender/source of received funds.

## Confirmed network constants

- HyperEVM mainnet chain id: `999`
- RPC endpoint: `https://rpc.hyperliquid.xyz/evm`
- RPC sanity check: `eth_chainId` returns `0x3e7` (decimal 999)

## Data sources evaluated

### A) Etherscan V2 (via HyperEVM explorer stack)

Key points from Etherscan docs:
- Base: `https://api.etherscan.io/v2/api`
- HyperEVM selector: `chainid=999`
- Free tier limits:
- up to 100,000 calls/day
- up to 5 calls/second
- historical endpoints are throttled to 2 calls/second
- API key is required for practical access.

HyperEVM-relevant account actions:
- `txlist` (normal txs)
- `txlistinternal` (internal txs)
- `tokentx` (ERC-20 transfers)
- `balance`

Sources:
- https://docs.etherscan.io/introduction
- https://docs.etherscan.io/supported-chains
- https://docs.etherscan.io/resources/rate-limits
- https://docs.etherscan.io/resources/common-error-messages

### B) Hyperscan (Blockscout API v2)

Key points:
- Explorer: `https://www.hyperscan.com`
- API: `https://www.hyperscan.com/api/v2`
- API docs UI: `https://www.hyperscan.com/api-docs`
- Keyless access works for core endpoints.
- Rich wallet history endpoints:
- normal txs
- internal txs
- token transfers
- coin balance deltas

Sources:
- https://www.hyperscan.com
- https://www.hyperscan.com/api-docs
- https://docs.blockscout.com/devs/apis/rest

## Backend decision

- Default source: Hyperscan (keyless, low-friction).
- Optional source: Etherscan V2 for compatibility and alternate data path when `ETHERSCAN_API_KEY` is configured.
- Design requirement: normalize both sources into one chat output shape.

## Tracing model used

Always evaluate these classes together:
- Normal transactions
- Internal transactions
- Token transfers

Optional reconciliation:
- Native coin balance deltas for net flow and gas impact.

## Sender attribution policy

Attribution output must include:
- tx hash
- from and to
- asset and amount
- timestamp
- direction
- confidence level

Confidence approach:
- High: direct non-zero transfer and clear sender path.
- Medium: sender inferred from contract-mediated flow with coherent evidence.
- Low: ambiguous internal/event-only traces.
