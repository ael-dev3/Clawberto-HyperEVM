---
name: execute-hyperevm-transactions
description: HyperEVM execution skill that signs and broadcasts transactions using a separate live-execution layer (Foundry cast), with strict safety gates and explicit confirmation. Use when users explicitly want to execute a prepared transaction on HyperEVM mainnet (chain id 999), not just inspect history. Supports deterministic `hexec ...` and `/hexec ...` commands plus limited NL preflight, and keeps private key handling in environment variables only.
---

# Execute HyperEVM Transactions

Execute live HyperEVM transactions after tracing/planning.

Network constants:
- Chain ID: `999`
- RPC: `https://rpc.hyperliquid.xyz/evm`

Execution boundary:
- This skill signs and broadcasts transactions.
- This skill is separate from tracing/planning.
- Use tracing/planning first (`trace-hyperevm-wallet`), then execute.

## Prerequisites

- Foundry `cast` installed and available in `PATH`.
- Private key set in env var (default: `HYPEREVM_EXEC_PRIVATE_KEY`).
- Wallet aliases configured (reuses `~/.clawdbot/hyperevm/config.json` from the tracing skill).

## Supported commands

- `health`
- `send-native <from|label> <to> --amount <decimal> [--pk-env ENV] [--broadcast --yes SEND] [--legacy] [--no-wait]`
- `broadcast-raw <0xSignedTransaction> --yes SEND [--no-wait]`

## Safety defaults

- Default mode is dry-run preflight (no broadcast).
- Live send requires both flags:
- `--broadcast`
- `--yes SEND`
- Print full sender/recipient addresses and full tx hashes in execution output.
- Enforce `amount > 0` for send flow.
- Reject suspiciously short raw signed payloads before broadcast.
- Reject ambiguous natural-language send requests; require deterministic command syntax.
- Sender validation enforced:
- private key must derive to the same `from` address.
- Broadcast blocked on:
- chain mismatch
- insufficient funds
- missing explicit confirmation

## Bundled files

- `scripts/hyperevm_execute_api.mjs`: RPC/cast helpers + preflight + receipt waiting
- `scripts/hyperevm_execute_chat.mjs`: parser/dispatcher for execution commands
- `references/foundry-cast-execution.md`: command and safety references

## Quick manual tests

```bash
node skills/execute-hyperevm-transactions/scripts/hyperevm_execute_chat.mjs "hexec health"
node skills/execute-hyperevm-transactions/scripts/hyperevm_execute_chat.mjs "hexec send-native HL:0xFrom... HL:0xTo... --amount 0.01"
# live execution (explicit):
# export HYPEREVM_EXEC_PRIVATE_KEY=0x...
node skills/execute-hyperevm-transactions/scripts/hyperevm_execute_chat.mjs "hexec send-native HL:0xFrom... HL:0xTo... --amount 0.01 --broadcast --yes SEND"

# Native unit sanity check:
cast balance --ether https://rpc.hyperliquid.xyz/evm 0x...
# 1 HYPE = 1e18 wei
```

