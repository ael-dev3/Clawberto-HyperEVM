---
name: trace-hyperevm-wallet
description: HyperEVM wallet tracing and execution-planning skill for transaction history, sender attribution, market context, and transaction preparation on HyperEVM mainnet (chain id 999). Use when users need to investigate what was sent to a wallet, obtain trade context, and prepare safe transaction execution steps (nonce/gas/fee/template) without handling private keys. Supports deterministic `hype ...` and `/hype ...` commands plus natural language, with Hyperscan (Blockscout API v2) as default and Etherscan V2 (`chainid=999`) as optional source.
---

# Trace HyperEVM Wallet

Implement wallet tracing and transaction planning for HyperEVM.

Network constants:
- Chain ID: `999`
- RPC: `https://rpc.hyperliquid.xyz/evm`

Primary data sources:
- Hyperscan Blockscout API v2: `https://www.hyperscan.com/api/v2`
- Etherscan V2 (optional): `https://api.etherscan.io/v2/api` with `chainid=999`
- Hyperliquid Info endpoint (market context): `https://api.hyperliquid.xyz/info`

## Supported input styles

Treat these as equivalent:

- Natural language:
- "show full history for 0x..."
- "who sent me this on HyperEVM"
- "check incoming transfers for this wallet"
- Terminal style:
- `hype history HL:0x... --limit 50`
- `hype all HL:0x... --limit 25`
- Slash style:
- `/hype tx 0x...`
- `/hype explain-inflow HL:0x...`

Parse `/hype` and `hype` first (deterministic). If no prefix, fall back to intent extraction.

## Canonical commands (v1)

Network:
- `network`: verify RPC chain id and latest block
- `recent [--limit N]`: recent HyperEVM txs (global feed)
- `quote <coin>`: quick Hyperliquid perp context for execution planning

Execution planning (non-custodial):
- `transact-help`: execution checklist and safety flow
- `transfer-plan <from|label> <to> --amount <decimal>`: nonce/gas/fee checks + unsigned tx template + local signing command hints

Address history:
- `history <HL:0x..|0x..|label> [--limit N] [--source hyperscan|etherscan|auto]`
- `incoming <...> [--limit N] [--source ...]`
- `outgoing <...> [--limit N] [--source ...]`
- `internal <...> [--limit N] [--source ...]`
- `tokens <...> [--limit N] [--source ...]`
- `all <...> [--limit N] [--source ...]`: combined summary across history classes
- `explain-inflow <...> [--lookback N] [--source ...]`: classify likely source of inbound flow

Transaction:
- `tx <0x-hash>`: inspect tx details and RPC receipt fields

Saved account aliases:
- `account list`
- `account add "main wallet" HL:0x... [--default]`
- `account remove "main wallet"`
- `account default "main wallet"`

## Data model expectations

Always distinguish these classes:
- Normal transactions (external tx history)
- Internal transactions (contract-internal value movement)
- Token transfers (ERC-20 logs/events)

For sender attribution, compare all three classes before concluding.

Execution boundary:
- This skill prepares and validates transaction plans.
- This skill does not store private keys.
- Signing and broadcast must happen in external wallet/custody tooling.

## Source selection guidance

Prefer:
- Hyperscan for default no-key usage and rich Blockscout endpoints.

Use Etherscan V2 when:
- `ETHERSCAN_API_KEY` is present.
- User specifically asks for Etherscan responses.

## Bundled files

- `scripts/hyperevm_scan_api.mjs`: API/RPC client + normalization helpers
- `scripts/hyperevm_scan_chat.mjs`: command parser + dispatcher + output formatting
- `scripts/hyperevm_scan_config.mjs`: local alias configuration
- `references/etherscan-v2-hyperevm.md`: Etherscan V2 free-tier + HyperEVM notes
- `references/hyperscan-blockscout-hyperevm.md`: Hyperscan endpoint mapping
- `references/transaction-history-playbook.md`: practical investigation workflow
- `references/hyperevm-transaction-execution.md`: transaction execution and safety runbook

## Output rules

- Keep responses short and evidence-first.
- Include tx hash, from, to, value/token amount, timestamp, and direction.
- Add explicit uncertainty markers when attribution is not definitive.
- Avoid implying ownership/identity without a labeled source.

## Quick manual tests

```bash
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype network"
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype quote BTC"
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype history HL:0x..."
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype transfer-plan HL:0xFrom... HL:0xTo... --amount 0.01"
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype tx 0x..."
```
