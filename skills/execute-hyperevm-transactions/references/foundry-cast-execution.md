# HyperEVM Execution Reference (Foundry Cast)

Date: 2026-02-20

## Scope

Reference notes for live transaction execution with Foundry `cast`.

## Verified docs

- `cast send` reference: https://getfoundry.sh/cast/reference/send/
- `cast wallet address` reference: https://getfoundry.sh/cast/reference/wallet/address/

## Relevant `cast send` options

- `cast send <TO> --value <AMOUNT>`
- `--rpc-url <URL>`
- `--private-key <RAW_PRIVATE_KEY>`
- `--nonce <NONCE>`
- `--gas-price <PRICE>`
- `--gas-limit <LIMIT>`
- `--legacy`
- `--json`

## Relevant wallet utility

- `cast wallet address --private-key <RAW_PRIVATE_KEY>`
- Used for signer-address verification before broadcast.

## HyperEVM-specific constants

- Chain ID: `999`
- RPC: `https://rpc.hyperliquid.xyz/evm`

## Operational safeguards used in this repo

- Dry-run default (no send unless explicit broadcast flags are set).
- Explicit confirmation token required: `--yes SEND`.
- Signer address derived from private key must match requested sender.
- Chain id check must match `999` before broadcast.
- Preflight nonce/gas/balance/funds check before live send.
