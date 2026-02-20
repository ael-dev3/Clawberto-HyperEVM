---
name: trace-hyperevm-wallet
description: Read-only HyperEVM wallet tracing skill for transaction history, sender attribution, and transaction inspection. Use when users need to investigate what was sent to a wallet, by whom, and via which path (normal tx, internal tx, token transfer) on HyperEVM mainnet (chain id 999). Supports deterministic `hype ...` and `/hype ...` commands plus natural language, with Hyperscan (Blockscout API v2) as default and Etherscan V2 (`chainid=999`) as optional source.
---

# Trace HyperEVM Wallet (read-only)

Implement read-only wallet tracing for HyperEVM.

Network constants:
- Chain ID: `999`
- RPC: `https://rpc.hyperliquid.xyz/evm`

Primary data sources:
- Hyperscan Blockscout API v2: `https://www.hyperscan.com/api/v2`
- Etherscan V2 (optional): `https://api.etherscan.io/v2/api` with `chainid=999`

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

## Output rules

- Keep responses short and evidence-first.
- Include tx hash, from, to, value/token amount, timestamp, and direction.
- Add explicit uncertainty markers when attribution is not definitive.
- Avoid implying ownership/identity without a labeled source.

## Quick manual tests

```bash
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype network"
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype history HL:0x..."
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype tx 0x..."
```
