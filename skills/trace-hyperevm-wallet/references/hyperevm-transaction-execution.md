# HyperEVM Transaction Execution Runbook

This runbook is the execution layer paired with wallet tracing.

## Scope

- Prepare and validate transaction execution on HyperEVM.
- Use chain id `999` and RPC `https://rpc.hyperliquid.xyz/evm`.
- Keep signing non-custodial (wallet/custody tool); do not store private keys in the skill.

## Pre-execution sequence

1. Confirm network:
- `hype network` must report chain id 999.

2. Get market context:
- `hype quote BTC` (or coin of interest) for current mark/mid/oracle.
- For richer analytics, use the dedicated Hyperliquid market-data skill.

3. Inspect wallet risk/history:
- `hype all <wallet> --limit 25`
- `hype explain-inflow <wallet> --lookback 50`

4. Build transfer execution plan:
- `hype transfer-plan <from> <to> --amount <decimal>`
- Validate nonce, gas estimate, estimated fee, and funds sufficiency.

## Transaction construction checklist

Required tx fields:
- `chainId` = `999`
- `from`
- `to`
- `value` (for native transfers) and/or `data` (for contract calls)
- `nonce` (pending)
- `gas` (estimated + safety buffer if needed)
- `gasPrice` (or EIP-1559 fields if supported in your tooling)

Recommended workflow:
1. Build unsigned tx object.
2. Sign in external wallet/custody tool.
3. Broadcast signed payload via `eth_sendRawTransaction`.
4. Confirm receipt success and gas usage.
5. Verify resulting state (balances/positions).

## Safety controls

- Execute a small test transaction first.
- Re-quote market data immediately before size-critical actions.
- Enforce max slippage/price impact for swaps.
- Stop after repeated failures and inspect reverts before retrying.
- Never assume label/identity from raw addresses without independent confirmation.

## Example (local signing via cast)

```bash
cast send --rpc-url https://rpc.hyperliquid.xyz/evm --private-key $PK 0xRecipient --value 0.01ether
```

After broadcast:
- Use `hype tx <hash>` to verify status and fee.
