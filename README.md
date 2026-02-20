# Clawberto HyperEVM Skills

HyperEVM transaction tracing and execution-planning skills for OpenClaw-style workflows.

![HyperEVM Skill Overview](HyperEVM.jpg)

## Skills

- `skills/trace-hyperevm-wallet`: tracing, attribution, quote context, and non-custodial execution planning. Docs: `skills/trace-hyperevm-wallet/SKILL.md`
- `skills/execute-hyperevm-transactions`: separate live-execution layer for signing and broadcasting (`cast send` + raw broadcast). Docs: `skills/execute-hyperevm-transactions/SKILL.md`

## What It Covers

- Full wallet history on HyperEVM (normal, internal, token transfers).
- Transaction inspection and sender attribution support.
- Full-address/full-hash output defaults to prevent truncation mistakes.
- Network constants: Chain ID `999`, RPC `https://rpc.hyperliquid.xyz/evm`.
- Non-custodial transaction planning (`transfer-plan`) with nonce/gas/fee checks.
- Optional Hyperliquid perp context and exposure checks (`quote`, `positions`).
- Separate execution layer for live sends with explicit confirmation gates.

## Quick Start

```bash
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype network"
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype positions HL:0x..."
node skills/trace-hyperevm-wallet/scripts/hyperevm_scan_chat.mjs "hype transfer-plan HL:0xFrom... HL:0xTo... --amount 0.01"
node skills/execute-hyperevm-transactions/scripts/hyperevm_execute_chat.mjs "hexec health"
node skills/execute-hyperevm-transactions/scripts/hyperevm_execute_chat.mjs "hexec send-native HL:0xFrom... HL:0xTo... --amount 0.01"
```
