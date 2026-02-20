# Trace HyperEVM Wallet Skill (Clawberto)

Read-only HyperEVM wallet tracing assistant for transaction history and sender attribution.

- Supports natural language, terminal-style (`hype ...`), and slash-style (`/hype ...`) commands.
- Focuses on HyperEVM mainnet:
- Chain ID: `999`
- RPC: `https://rpc.hyperliquid.xyz/evm`
- Uses explorer/indexer APIs for full history:
- Hyperscan (Blockscout API v2, keyless default)
- Etherscan V2 (`chainid=999`, optional with API key)

## What this skill helps with

- Check complete wallet history quickly.
- Separate normal txs, internal txs, and ERC-20 token transfers.
- Inspect a transaction hash and summarize who sent what.
- Explain likely source of inbound funds (direct transfer vs contract flow vs token distribution).
- Keep local address aliases for repeated investigation.

## Canonical commands

### Network and health
- `hype network`
- `hype recent --limit 20`

### Address history
- `hype history HL:0x... --limit 50`
- `hype incoming HL:0x... --limit 30`
- `hype outgoing HL:0x... --limit 30`
- `hype internal HL:0x... --limit 30`
- `hype tokens HL:0x... --limit 30`
- `hype all HL:0x... --limit 25`
- `hype explain-inflow HL:0x... --lookback 50`

### Transaction inspection
- `hype tx 0x...`

### Source selection
- `--source hyperscan|etherscan|auto`
- default: `auto` (Hyperscan first; Etherscan optional if API key exists)

### Saved account aliases
- `hype account add "main wallet" HL:0x... --default`
- `hype account list`
- `hype account remove "main wallet"`
- `hype account default "main wallet"`
- `hype history "main wallet"`

## Environment variables

- `HYPEREVM_RPC_URL` (default `https://rpc.hyperliquid.xyz/evm`)
- `HYPEREVM_CHAIN_ID` (default `999`)
- `HYPEREVM_TIMEOUT_MS` (default `12000`)
- `HYPERSCAN_API_URL` (default `https://www.hyperscan.com/api/v2`)
- `ETHERSCAN_API_URL` (default `https://api.etherscan.io/v2/api`)
- `ETHERSCAN_API_KEY` (optional but required for Etherscan endpoint calls)
- `CLAWDBOT_HYPEREVM_CONFIG` (optional config file override)

## Local dev quick run

```bash
node scripts/hyperevm_scan_chat.mjs "hype network"
node scripts/hyperevm_scan_chat.mjs "hype history HL:0x..."
node scripts/hyperevm_scan_chat.mjs "hype tx 0x..."
```
