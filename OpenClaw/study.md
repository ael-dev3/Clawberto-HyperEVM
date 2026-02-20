# Hyperliquid Skill Study Notes

Studied on: 2026-02-20  
Primary source: https://playbooks.com/skills/openclaw/skills/hyperliquid  
Underlying repo path: `openclaw/skills/skills/k0nkupa/hyperliquid`

## What this skill is

- A read-only Hyperliquid data assistant.
- Supports three input styles:
- Natural language
- Deterministic `hl ...` commands
- Deterministic `/hl ...` commands
- Uses only the Hyperliquid Info HTTP endpoint: `POST https://api.hyperliquid.xyz/info`.
- Explicitly avoids trading/private key flows.

## Files and responsibilities

- `scripts/hyperliquid_chat.mjs`
- Main dispatcher/parser/formatter.
- Handles command-mode first, then natural-language fallback.
- `scripts/hyperliquid_api.mjs`
- Thin API client with timeout and helper formatters.
- `scripts/hyperliquid_config.mjs`
- Local alias storage for account labels.
- `references/hyperliquid-api.md`
- Request body examples and field notes.

## API calls used

- `metaAndAssetCtxs` (perp universe + ctxs)
- `l2Book` (orderbook snapshot)
- `candleSnapshot` (OHLCV window)
- `clearinghouseState` (perp positions/margin)
- `spotClearinghouseState` (spot balances)
- `openOrders` (open perp orders)
- `userFills` (recent fills)

## Command surface (implemented)

- Market:
- `quote <coin>`
- `movers [--top N]`
- `funding-top [--n N]`
- `funding-bottom [--n N]`
- `book <coin>`
- `candles <coin> --interval <...> --last N` or `--start <ms> --end <ms>`
- `overview`
- Account read-only:
- `positions <address|label>`
- `balances <address|label>`
- `orders <address|label>`
- `fills <address|label> [--n N]`
- Account alias management:
- `account list`
- `account add "<label>" HL:0x... [--default]`
- `account remove "<label>"`
- `account default "<label>"`

## Important implementation details

- Prefix commands (`hl` / `/hl`) are parsed first and are deterministic.
- Natural-language parser is keyword-based heuristics.
- Coin extraction for NL uses first all-caps token regex (`[A-Z][A-Z0-9]{1,9}`).
- Account resolution order:
- Explicit address in text
- Saved alias label
- Default saved alias
- Alias file path:
- `~/.clawdbot/hyperliquid/config.json`
- Override env:
- `CLAWDBOT_HYPERLIQUID_CONFIG`
- API timeout default:
- `10_000ms`
- Env override:
- `HYPERLIQUID_TIMEOUT_MS`

## Observed behavior and caveats

- `movers` sorts by absolute 24h change magnitude (`|%|`), not strictly winners-only.
- `book` output prints top 10 levels/side (docs mention top 20).
- `candles` calculates window from `--interval * --last`, but prints only last 10 rows.
- `overview` prints:
- movers top 5
- funding top 5
- OI top 5
- It does not include top volume despite overview text implying it.
- NL intent `"funding"` (without top/bottom) maps to a `funding` command that is not directly implemented; fallback ends up returning `overview`.

## Data formatting choices

- Price precision adapts by magnitude:
- `>=1000`: 2 dp
- `>=1`: 4 dp
- `<1`: 6 dp
- Percentage formatter always keeps sign and 2 dp.
- Position formatter includes:
- side/size/mark/entry/liquidation/liquidation-distance
- uPnL/ROE/position value
- leverage + margin used + cumulative funding since open

## Quick smoke test run

- Executed:
- `node .tmp_openclaw_hyperliquid/scripts/hyperliquid_chat.mjs "hl quote BTC"`
- Result:
- Successful live response from Hyperliquid Info API with mark/mid/oracle/funding/OI/24h metrics.

## Useful takeaways for OpenClaw

- Reuse the thin-API wrapper pattern (`post + timeout + bounded error text`) for other external integrations.
- Reuse alias config pattern for operator-managed account/watchlist labels.
- Keep deterministic command mode first, then NL fallback (good for automation + chat coexistence).
- If adapted further, fix mismatches above first (`funding` intent handling, overview volume block, docs vs level counts).
