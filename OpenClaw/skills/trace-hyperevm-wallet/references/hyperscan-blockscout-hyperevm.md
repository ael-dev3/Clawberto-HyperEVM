# Hyperscan (Blockscout API v2) for HyperEVM

Hyperscan is a Blockscout-based explorer for HyperEVM and is useful as a keyless default source.

- Base explorer: `https://www.hyperscan.com`
- API base: `https://www.hyperscan.com/api/v2`
- API docs UI: `https://www.hyperscan.com/api-docs`

## Endpoints used by this skill

Address summary:
- `GET /addresses/{address}`

Address normal tx history:
- `GET /addresses/{address}/transactions`

Address internal tx history:
- `GET /addresses/{address}/internal-transactions`

Address token transfer history:
- `GET /addresses/{address}/token-transfers`

Address native balance delta history:
- `GET /addresses/{address}/coin-balance-history`

Global recent tx feed:
- `GET /transactions`

Single tx detail:
- `GET /transactions/{hash}`

## Pagination note

Many list endpoints return `next_page_params`. Follow this object exactly as query params for the next request. Continue until `next_page_params` is null or empty.

## Data classes for tracing

Use all three classes before making sender claims:
- Normal txs
- Internal txs
- Token transfers

Native balance deltas help reconcile gas costs and net flow.
