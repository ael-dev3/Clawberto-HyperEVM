# trace-hyperevm-wallet: pre-implementation research

Date: 2026-02-20

## Why this name

- Folder name: `trace-hyperevm-wallet`
- Rationale: verb-led, short, and directly maps to the user problem ("what was sent to this wallet, by whom, and why").

## Problem to solve

Clawberto needs to answer:
- What transactions hit this HyperEVM wallet?
- Which transfer delivered the received HYPE?
- Who sent it (wallet/contract/known label)?
- Was it likely an airdrop, direct transfer, or contract flow?

## Research findings

### 1) HyperEVM explorer options

- Hyperliquid docs list HyperEVM block explorers:
- `https://hyperevmscan.io`
- `https://www.hyperscan.com`
- (source: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperevm/overview/block-explorers)

### 2) Hyperevmscan (Etherscan-powered)

- UI footer links to Etherscan API docs and plans.
- Uses Etherscan V2 API model (`chainid=999` for HyperEVM).
- Verified by live call: `api.etherscan.io/v2/api?...chainid=999...` returns `Missing/Invalid API Key` without key.
- Sources:
- https://hyperevmscan.io
- https://docs.etherscan.io/introduction
- https://docs.etherscan.io/supported-chains

Implication:
- Good compatibility if API key exists.
- Not ideal as the only backend for a no-setup skill.

### 3) Hyperscan (Blockscout-powered)

- Hyperscan identifies as Blockscout explorer.
- Live REST API v2 endpoints work without API key:
- `/api/v2/addresses/{address}`
- `/api/v2/addresses/{address}/transactions`
- `/api/v2/addresses/{address}/internal-transactions`
- `/api/v2/addresses/{address}/token-transfers`
- `/api/v2/addresses/{address}/coin-balance-history`
- `/api/v2/stats`
- API docs page exists at `/api-docs`.
- Sources:
- https://www.hyperscan.com
- https://www.hyperscan.com/api-docs
- https://docs.blockscout.com/devs/apis/rest
- https://docs.blockscout.com/api-reference/get-address-transactions
- https://docs.blockscout.com/api-reference/get-address-coin-balance-history

Implication:
- Best default backend for this skill (no API key friction).

## Recommended backend strategy

- Primary: Hyperscan Blockscout REST v2 (keyless).
- Optional fallback/secondary: Etherscan V2 (`chainid=999`) when `ETHERSCAN_API_KEY` is provided.
- Keep response normalization layer so skill output is backend-agnostic.

## v1 skill scope (research-approved, not implemented yet)

- Address-first investigation:
- `wallet-summary <address>`
- `incoming <address> [--limit N]`
- `sent <address> [--limit N]`
- `token-flows <address> [--limit N]`
- `balance-delta <address> [--limit N]`
- Tx-first investigation:
- `tx-inspect <txHash>`
- `tx-counterparty <txHash>`
- Attribution helper:
- `why-received <address> [--lookback N]`

## Classification heuristics for "what sent this?"

- Direct native transfer:
- `value > 0` and simple transfer pattern (no complex internal cascade).
- Contract-mediated transfer:
- Incoming value appears in internal txs or via contract interactions.
- Token transfer vs native transfer:
- Use `token-transfers` plus coin balance history to disambiguate.
- Possible airdrop pattern:
- Sender appears as known/labeled distributor or contract.
- Similar small-value transfers across many recipients around same time/block range.

## Minimum data needed per finding

- `tx_hash`, `block_number`, `timestamp`
- `from`, `to`
- `asset` (`HYPE` native or token symbol/address)
- `amount` (normalized)
- direction (`in`/`out`)
- confidence label for attribution (`high`/`medium`/`low`)
- explorer links:
- `https://www.hyperscan.com/tx/{hash}`
- `https://www.hyperscan.com/address/{address}`

## Implementation notes for next step

- Build a thin API client for Hyperscan first.
- Support Blockscout keyset pagination via `next_page_params`.
- Add deterministic command parsing before NL parsing (same pattern used in prior OpenClaw study).
- Return compact, chat-friendly bullet outputs with explicit uncertainty markers.
