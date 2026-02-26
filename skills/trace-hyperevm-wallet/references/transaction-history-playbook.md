# HyperEVM Transaction History Playbook

Use this sequence to answer "what was sent to me and by whom?"

## Step 1: Verify network context

- Confirm chain id is `999`.
- Confirm RPC is reachable: `https://rpc.hyperliquid.xyz/evm`.
- Confirm target address format is valid (`0x...` 40 hex chars).
- Confirm native unit convention: `1 HYPE = 1e18 wei` (this is what all HYPE↔wei conversions in this playbook use).

## Step 2: Pull normal tx history

- Load recent normal txs for the address.
- Split into incoming (`to == address`) and outgoing (`from == address`).
- Mark txs with non-zero native value separately from contract-call txs with zero value.

## Step 3: Pull internal tx history

- Load internal txs for the same range.
- Identify value movement that does not appear as direct external transfer.
- Flag contract-create and contract-call internal flows.

## Step 4: Pull token transfer history

- Load ERC-20 transfer logs.
- Separate incoming/outgoing token flow.
- Keep token symbol and token contract address together in output.

## Step 5: Reconcile with balance deltas (optional but useful)

- Check native `coin-balance-history` deltas for net movement.
- Consider gas burn effects when comparing inbound/outbound values.

## Step 6: Attribution statement

Build a bounded-confidence conclusion:
- Direct transfer: non-zero native value directly from sender address.
- Contract-mediated: inbound effect mainly visible in internal txs/token transfers.
- Possible distribution/airdrop: token/native inflow from contract/distributor pattern.

Include:
- full tx hash (66 chars)
- full sender address
- full receiver address
- asset and amount
- timestamp
- confidence label (`high`, `medium`, `low`)
