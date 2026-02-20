#!/usr/bin/env node
// Command + NL interface for HyperEVM wallet tracing.

import {
  DEFAULT_CHAIN_ID,
  DEFAULT_RPC_URL,
  assertAddress,
  normalizeAddress,
  normalizeTxHash,
  assertTxHash,
  hasEtherscanKey,
  rpcChainId,
  rpcBlockNumber,
  rpcGetBalance,
  rpcGetTransactionCount,
  rpcGasPrice,
  rpcEstimateGas,
  rpcGetTransactionByHash,
  rpcGetTransactionReceipt,
  hyperliquidMetaAndAssetCtxs,
  hyperliquidClearinghouseState,
  hyperscanTransaction,
  hyperscanRecentTransactions,
  hyperscanAddressTransactions,
  hyperscanAddressInternalTransactions,
  hyperscanAddressTokenTransfers,
  hyperscanAddressCoinBalanceHistory,
  hyperscanCollectPaged,
  etherscanTxList,
  etherscanInternalTxList,
  etherscanTokenTxList,
  normalizeNormalTx,
  normalizeInternalTx,
  normalizeTokenTransfer,
  toDirection,
  formatUnits,
  parseDecimalToUnits,
  toHexQuantity,
  fmtPx,
  pctChange,
  fmtPct,
  txLink,
} from "./hyperevm_scan_api.mjs";

import {
  loadConfig,
  setAccountAlias,
  removeAccountAlias,
  setDefaultAccount,
  resolveAccountRef,
  extractEvmAddress,
} from "./hyperevm_scan_config.mjs";

function stripPrefix(raw) {
  const t = raw.trim();
  const lower = t.toLowerCase();
  const prefixes = ["/hype", "hype", "/hevm", "hevm"];
  for (const p of prefixes) {
    if (lower === p) return "";
    if (lower.startsWith(`${p} `)) return t.slice(p.length).trim();
  }
  return null;
}

function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const m of s.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]);
  return out.filter(Boolean);
}

function parseArgs(tokens) {
  const args = { _: [] };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = tokens[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(tok);
    }
  }
  return args;
}

function intArg(v, fallback, { min = 1, max = 1000 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeSource(source) {
  const s = String(source ?? "auto").trim().toLowerCase();
  if (s === "auto" || s === "hyperscan" || s === "etherscan") return s;
  throw new Error(`Unknown source: ${source}. Use hyperscan, etherscan, or auto.`);
}

function sourceOrder(source) {
  const s = normalizeSource(source);
  if (s === "hyperscan") return ["hyperscan"];
  if (s === "etherscan") return ["etherscan"];
  return hasEtherscanKey() ? ["hyperscan", "etherscan"] : ["hyperscan"];
}

function fmtTs(ts) {
  if (!ts) return "unknown-time";
  return String(ts).replace(/\.\d+Z$/, "Z");
}

function renderAddress(addr) {
  return normalizeAddress(addr) || String(addr ?? "n/a");
}

function renderHash(hash) {
  return normalizeTxHash(hash) || String(hash ?? "n/a");
}

function truncatedHashCandidate(value) {
  const raw = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]+$/.test(raw)) return null;
  if (raw.length >= 66) return null;
  if (raw.length < 10) return null;
  return raw;
}

function formatNormalLine(item, focusAddress) {
  const dir = toDirection({ from: item.from, to: item.to, address: focusAddress });
  const value = formatUnits(item.valueWei, 18, { precision: 6 });
  const status = item.status && item.status !== "ok" ? ` | ${item.status}` : "";
  const method = item.method ? ` | ${String(item.method).slice(0, 36)}` : "";
  return `- [${dir}] ${fmtTs(item.timestamp)} | ${value} HYPE | ${renderAddress(item.from)} -> ${renderAddress(item.to)} | ${renderHash(item.hash)}${status}${method}`;
}

function formatInternalLine(item, focusAddress) {
  const dir = toDirection({ from: item.from, to: item.to, address: focusAddress });
  const value = formatUnits(item.valueWei, 18, { precision: 6 });
  const status = item.status && item.status !== "ok" ? ` | ${item.status}` : "";
  const method = item.method ? ` | ${String(item.method).slice(0, 24)}` : "";
  return `- [${dir}] ${fmtTs(item.timestamp)} | ${value} HYPE | ${renderAddress(item.from)} -> ${renderAddress(item.to)} | ${renderHash(item.hash)}${status}${method}`;
}

function formatTokenAmount(raw, decimals) {
  return formatUnits(raw, decimals, { precision: 6 });
}

function formatTokenLine(item, focusAddress) {
  const dir = toDirection({ from: item.from, to: item.to, address: focusAddress });
  const amt = formatTokenAmount(item.tokenValueRaw, item.tokenDecimals);
  const sym = item.tokenSymbol || "TOKEN";
  return `- [${dir}] ${fmtTs(item.timestamp)} | ${amt} ${sym} | ${renderAddress(item.from)} -> ${renderAddress(item.to)} | ${renderHash(item.hash)}`;
}

function extractAddress(text) {
  return extractEvmAddress(text);
}

function extractTxHash(text) {
  return normalizeTxHash(text);
}

function extractCoin(text) {
  const m = String(text ?? "").match(/\b[A-Z][A-Z0-9]{1,9}\b/);
  return m ? m[0] : null;
}

function guessIntentFromNL(text) {
  const t = text.toLowerCase();

  if ((t.includes("store") || t.includes("save")) && t.includes("0x") && t.includes(" as ")) return { cmd: "account-save" };
  if (t.includes("saved account") || t.includes("account list")) return { cmd: "account-list" };

  if (t.includes("chain id") || t.includes("rpc") || t.includes("network")) return { cmd: "network" };
  if (t.includes("recent tx") || t.includes("latest tx")) return { cmd: "recent" };
  if (t.includes("quote") || t.includes("price")) return { cmd: "quote" };
  if (/\b(position|positions|pnl|p\/l|margin)\b/.test(t)) return { cmd: "positions" };
  if (/\b(transact|execution|execute|swap|send)\b/.test(t) || /\btrade(s|d|ing)?\b/.test(t)) return { cmd: "transact-help" };
  if (t.includes("transfer plan") || t.includes("send plan")) return { cmd: "transfer-plan" };
  if (t.includes("all transactions") || t.includes("full history") || t.includes("check all")) return { cmd: "all" };
  if (t.includes("incoming") || t.includes("received")) return { cmd: "incoming" };
  if (t.includes("outgoing") || t.includes("sent from")) return { cmd: "outgoing" };
  if (t.includes("internal tx")) return { cmd: "internal" };
  if (t.includes("token transfer") || t.includes("erc20")) return { cmd: "tokens" };
  if (t.includes("who sent") || t.includes("airdrop") || t.includes("explain inflow")) return { cmd: "explain-inflow" };
  if ((t.includes("tx ") || t.includes("transaction")) && /0x[a-f0-9]{64}/.test(t)) return { cmd: "tx" };
  if (t.includes("history") || t.includes("transactions")) return { cmd: "history" };
  return { cmd: "history" };
}

async function etherscanCollect(fetchPage, { limit = 50, offset = 100, maxPages = 25 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages && out.length < limit; page++) {
    const rows = await fetchPage({ page, offset });
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < offset) break;
  }
  return out.slice(0, limit);
}

async function fetchNormalBySource(address, { source = "auto", limit = 50 } = {}) {
  const errors = [];
  for (const src of sourceOrder(source)) {
    try {
      if (src === "hyperscan") {
        const rows = await hyperscanCollectPaged(
          (pageParams) => hyperscanAddressTransactions({ address, pageParams }),
          { maxItems: limit, maxPages: Math.max(1, Math.ceil(limit / 50) + 1) }
        );
        return { source: src, items: rows.map((r) => normalizeNormalTx(r, { source: src })) };
      }

      const rows = await etherscanCollect(
        ({ page, offset }) => etherscanTxList({ address, page, offset, sort: "desc" }),
        { limit }
      );
      return { source: src, items: rows.map((r) => normalizeNormalTx(r, { source: src })) };
    } catch (e) {
      errors.push(`${src}: ${e.message}`);
    }
  }
  throw new Error(`Unable to load normal history. ${errors.join(" | ")}`);
}

async function fetchInternalBySource(address, { source = "auto", limit = 50 } = {}) {
  const errors = [];
  for (const src of sourceOrder(source)) {
    try {
      if (src === "hyperscan") {
        const rows = await hyperscanCollectPaged(
          (pageParams) => hyperscanAddressInternalTransactions({ address, pageParams }),
          { maxItems: limit, maxPages: Math.max(1, Math.ceil(limit / 50) + 1) }
        );
        return { source: src, items: rows.map((r) => normalizeInternalTx(r, { source: src })) };
      }

      const rows = await etherscanCollect(
        ({ page, offset }) => etherscanInternalTxList({ address, page, offset, sort: "desc" }),
        { limit }
      );
      return { source: src, items: rows.map((r) => normalizeInternalTx(r, { source: src })) };
    } catch (e) {
      errors.push(`${src}: ${e.message}`);
    }
  }
  throw new Error(`Unable to load internal history. ${errors.join(" | ")}`);
}

async function fetchTokenBySource(address, { source = "auto", limit = 50 } = {}) {
  const errors = [];
  for (const src of sourceOrder(source)) {
    try {
      if (src === "hyperscan") {
        const rows = await hyperscanCollectPaged(
          (pageParams) => hyperscanAddressTokenTransfers({ address, pageParams }),
          { maxItems: limit, maxPages: Math.max(1, Math.ceil(limit / 50) + 1) }
        );
        return { source: src, items: rows.map((r) => normalizeTokenTransfer(r, { source: src })) };
      }

      const rows = await etherscanCollect(
        ({ page, offset }) => etherscanTokenTxList({ address, page, offset, sort: "desc" }),
        { limit }
      );
      return { source: src, items: rows.map((r) => normalizeTokenTransfer(r, { source: src })) };
    } catch (e) {
      errors.push(`${src}: ${e.message}`);
    }
  }
  throw new Error(`Unable to load token transfers. ${errors.join(" | ")}`);
}

async function resolveAddressInput(ref) {
  const resolved = await resolveAccountRef(ref ?? "");
  if (!resolved.address) {
    if (resolved.source === "missing") {
      throw new Error('No address provided and no default account set. Add one with: hype account add "main wallet" HL:0x... --default');
    }
    throw new Error(`Unknown saved account: ${resolved.label ?? ref}`);
  }
  return resolved.address;
}

async function cmdNetwork() {
  const [cid, block] = await Promise.all([rpcChainId(), rpcBlockNumber()]);
  const lines = [];
  lines.push("HyperEVM network");
  lines.push(`- expected chain id: ${DEFAULT_CHAIN_ID}`);
  lines.push(`- rpc url: ${DEFAULT_RPC_URL}`);
  lines.push(`- rpc chain id: ${cid.decimal} (${cid.hex})${String(cid.decimal) === String(DEFAULT_CHAIN_ID) ? "" : " [MISMATCH]"}`);
  lines.push(`- latest block: ${block.decimal} (${block.hex})`);
  lines.push(`- etherscan key configured: ${hasEtherscanKey() ? "yes" : "no"}`);
  return lines.join("\n");
}

async function cmdRecent({ limit = 20 } = {}) {
  const rows = await hyperscanCollectPaged(
    (pageParams) => hyperscanRecentTransactions({ pageParams }),
    { maxItems: limit, maxPages: Math.max(1, Math.ceil(limit / 50) + 1) }
  );
  const lines = [];
  lines.push(`HyperEVM recent txs (source=hyperscan, count=${rows.length})`);
  for (const r of rows) {
    const n = normalizeNormalTx(r, { source: "hyperscan" });
    lines.push(`- ${fmtTs(n.timestamp)} | ${renderAddress(n.from)} -> ${renderAddress(n.to)} | ${renderHash(n.hash)} | ${formatUnits(n.valueWei, 18, { precision: 6 })} HYPE`);
  }
  return lines.join("\n");
}

async function getPerpsTable() {
  const [meta, ctxs] = await hyperliquidMetaAndAssetCtxs({ dex: "" });
  const universe = meta?.universe ?? [];
  return universe.map((u, i) => ({ u, c: ctxs?.[i] ?? {} }));
}

function fmtNum(x, { dp = 2 } = {}) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x ?? "n/a");
  return n.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 });
}

function fmtSignedNum(x, { dp = 2 } = {}) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x ?? "n/a");
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 })}`;
}

function liqDistancePct({ side, markPx, liquidationPx }) {
  const mark = Number(markPx);
  const liq = Number(liquidationPx);
  if (!Number.isFinite(mark) || !Number.isFinite(liq) || mark === 0) return null;
  if (side === "long") return ((mark - liq) / mark) * 100;
  if (side === "short") return ((liq - mark) / mark) * 100;
  return null;
}

function formatPositions(address, state, markByCoin = new Map()) {
  const lines = [];
  const ms = state?.marginSummary;
  const cms = state?.crossMarginSummary;
  const positions = Array.isArray(state?.assetPositions) ? state.assetPositions : [];

  lines.push(`Hyperliquid perp positions (${renderAddress(address)})`);

  if (ms) {
    const accountValue = Number(ms.accountValue);
    const marginUsed = Number(ms.totalMarginUsed);
    const free = Number.isFinite(accountValue) && Number.isFinite(marginUsed) ? accountValue - marginUsed : null;
    lines.push(
      `- margin acct: value ${fmtNum(ms.accountValue, { dp: 2 })} | notional ${fmtNum(ms.totalNtlPos, { dp: 2 })} | margin used ${fmtNum(ms.totalMarginUsed, { dp: 2 })}${free == null ? "" : ` | free ${fmtNum(free, { dp: 2 })}`}`
    );
  }

  if (cms) {
    lines.push(`- cross acct: value ${fmtNum(cms.accountValue, { dp: 2 })} | notional ${fmtNum(cms.totalNtlPos, { dp: 2 })}`);
  }

  if (state?.withdrawable != null) {
    lines.push(`- withdrawable: ${fmtNum(state.withdrawable, { dp: 2 })}`);
  }

  if (!positions.length) {
    lines.push("- no open perp positions");
    lines.push("- note: if you expected positions, query the master/sub-account owner address (not an agent wallet)");
    return lines.join("\n");
  }

  lines.push("- open positions:");
  for (const item of positions) {
    const p = item?.position;
    if (!p) continue;

    const szi = Number(p.szi);
    const side = Number.isFinite(szi) ? (szi > 0 ? "long" : szi < 0 ? "short" : "flat") : "unknown";
    const absSize = Number.isFinite(szi) ? Math.abs(szi) : p.szi;
    const mark = markByCoin.get(p.coin);
    const liqDist = liqDistancePct({ side, markPx: mark, liquidationPx: p.liquidationPx });

    const headerBits = [
      `${p.coin} ${side}`,
      `sz ${absSize}`,
      `mark ${mark == null ? "n/a" : fmtPx(mark)}`,
      `entry ${p.entryPx == null ? "n/a" : fmtPx(p.entryPx)}`,
      `liq ${p.liquidationPx == null ? "n/a" : fmtPx(p.liquidationPx)}`,
      liqDist == null ? null : `liq dist ${fmtPct(liqDist)}`,
    ].filter(Boolean);

    const pnlBits = [
      `uPnL ${fmtSignedNum(p.unrealizedPnl, { dp: 2 })}`,
      p.returnOnEquity == null ? null : `ROE ${fmtPct(Number(p.returnOnEquity) * 100)}`,
      p.positionValue == null ? null : `pos ${fmtNum(p.positionValue, { dp: 2 })}`,
    ].filter(Boolean);

    lines.push(`  - ${headerBits.join(" | ")}`);
    lines.push(`    - ${pnlBits.join(" | ")}`);

    if (p.leverage) {
      lines.push(
        `    - lev: ${p.leverage.type} ${p.leverage.value}x | marginUsed ${fmtNum(p.marginUsed, { dp: 2 })}${p.cumFunding?.sinceOpen == null ? "" : ` | funding since open ${fmtNum(p.cumFunding.sinceOpen, { dp: 4 })}`}`
      );
    }
  }

  return lines.join("\n");
}

async function cmdPositions({ address }) {
  const statePromise = hyperliquidClearinghouseState({ user: address, dex: "" });
  const marksPromise = getPerpsTable()
    .then((rows) => {
      const out = new Map();
      for (const row of rows) out.set(row.u?.name, row.c?.markPx);
      return out;
    })
    .catch(() => new Map());

  const [state, markByCoin] = await Promise.all([statePromise, marksPromise]);
  return formatPositions(address, state, markByCoin);
}

async function cmdQuote({ coin = "BTC" } = {}) {
  const ccy = String(coin || "BTC").toUpperCase();
  const rows = await getPerpsTable();
  const row = rows.find((r) => String(r.u?.name || "").toUpperCase() === ccy);
  if (!row) throw new Error(`Unknown Hyperliquid perp coin: ${ccy}`);

  const c = row.c || {};
  const chg = pctChange(c.markPx, c.prevDayPx);
  const lines = [];
  lines.push(`Hyperliquid ${ccy} quote (for HyperEVM execution context)`);
  lines.push(`- mark: ${fmtPx(c.markPx)} | mid: ${c.midPx == null ? "n/a" : fmtPx(c.midPx)} | oracle: ${c.oraclePx == null ? "n/a" : fmtPx(c.oraclePx)}`);
  lines.push(`- 24h: ${c.prevDayPx == null ? "n/a" : fmtPct(chg)} (prev ${fmtPx(c.prevDayPx)})`);
  if (c.funding != null) lines.push(`- funding: ${Number(c.funding * 100).toFixed(4)}%`);
  if (c.openInterest != null) lines.push(`- OI: ${Number(c.openInterest).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  if (c.dayNtlVlm != null) lines.push(`- 24h notional: ${Number(c.dayNtlVlm).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  lines.push("- note: use this with `hype transfer-plan` / swap playbook before execution");
  return lines.join("\n");
}

function cmdTransactHelp() {
  const lines = [];
  lines.push("HyperEVM transaction execution playbook (non-custodial)");
  lines.push(`- chain id: ${DEFAULT_CHAIN_ID}`);
  lines.push(`- rpc: ${DEFAULT_RPC_URL}`);
  lines.push("- pre-trade checks:");
  lines.push("  - get market context first: `hype quote BTC` (or the dedicated hyperliquid skill)");
  lines.push("  - verify wallet history/risk: `hype all <wallet>`");
  lines.push("  - verify nonce/balance/gas: `hype transfer-plan <from> <to> --amount 0.01`");
  lines.push("- signing model:");
  lines.push("  - this skill does not store private keys");
  lines.push("  - sign locally with wallet/custody tool (MetaMask, Ledger, Fireblocks, cast, etc)");
  lines.push("- send path:");
  lines.push("  1. build tx fields: to, value/data, nonce, gas, gasPrice, chainId=999");
  lines.push("  2. sign offline/in-wallet");
  lines.push("  3. broadcast signed tx via `eth_sendRawTransaction`");
  lines.push("- safety:");
  lines.push("  - never execute without fresh quote and slippage guardrails");
  lines.push("  - prefer small test tx first");
  lines.push("  - confirm receipt status before subsequent actions");
  return lines.join("\n");
}

function splitFromToRef(parts) {
  const tail = parts.filter(Boolean);
  const addrIdx = [];
  for (let i = 0; i < tail.length; i++) {
    if (normalizeAddress(tail[i])) addrIdx.push(i);
  }

  if (addrIdx.length >= 2) {
    return {
      fromRef: tail[addrIdx[0]],
      toAddress: tail[addrIdx[1]],
    };
  }

  if (addrIdx.length === 1) {
    const i = addrIdx[0];
    return {
      fromRef: tail.slice(0, i).join(" ").trim(),
      toAddress: tail[i],
    };
  }

  return { fromRef: tail.join(" ").trim(), toAddress: "" };
}

async function cmdTransferPlan({ fromRef, toAddress, amount }) {
  const fromAddress = await resolveAddressInput(fromRef || "");
  const to = assertAddress(toAddress);

  if (amount == null) throw new Error('Usage: hype transfer-plan <from> <to> --amount 0.01');
  const valueWei = parseDecimalToUnits(amount, 18);
  const valueHex = toHexQuantity(valueWei);

  const [balanceHex, nonceHex, gasPriceHex, estimatedGasHex] = await Promise.all([
    rpcGetBalance(fromAddress, "latest"),
    rpcGetTransactionCount(fromAddress, "pending"),
    rpcGasPrice(),
    rpcEstimateGas({ from: fromAddress, to, value: valueHex }).catch(() => "0x5208"), // fallback 21000
  ]);

  const balanceWei = BigInt(balanceHex || "0x0");
  const nonce = Number.parseInt(nonceHex || "0x0", 16);
  const gasPriceWei = BigInt(gasPriceHex || "0x0");
  const gasLimit = BigInt(estimatedGasHex || "0x5208");
  const estFeeWei = gasLimit * gasPriceWei;
  const totalWei = valueWei + estFeeWei;
  const enough = balanceWei >= totalWei;

  const lines = [];
  lines.push("HyperEVM transfer execution plan");
  lines.push(`- from: ${fromAddress}`);
  lines.push(`- to: ${to}`);
  lines.push(`- amount: ${amount} HYPE (${valueWei.toString()} wei)`);
  lines.push(`- nonce(pending): ${nonce}`);
  lines.push(`- gas limit(est): ${gasLimit.toString()}`);
  lines.push(`- gas price: ${formatUnits(gasPriceWei.toString(), 9, { precision: 3 })} gwei`);
  lines.push(`- est fee: ${formatUnits(estFeeWei.toString(), 18, { precision: 8 })} HYPE`);
  lines.push(`- wallet balance: ${formatUnits(balanceWei.toString(), 18, { precision: 8 })} HYPE`);
  lines.push(`- funds check: ${enough ? "ok" : "INSUFFICIENT for amount+fee"}`);
  lines.push("- unsigned tx template:");
  lines.push(`  - chainId: ${DEFAULT_CHAIN_ID}`);
  lines.push(`  - from: ${fromAddress}`);
  lines.push(`  - to: ${to}`);
  lines.push(`  - value: ${valueHex}`);
  lines.push(`  - nonce: ${toHexQuantity(nonce)}`);
  lines.push(`  - gas: ${toHexQuantity(gasLimit)}`);
  lines.push(`  - gasPrice: ${toHexQuantity(gasPriceWei)}`);
  lines.push("- cast example (local signing):");
  lines.push(`  cast send --rpc-url ${DEFAULT_RPC_URL} --private-key $PK ${to} --value ${amount}ether`);
  lines.push("- next step:");
  lines.push("  - sign and broadcast once checks pass; then verify with `hype tx <hash>`");
  return lines.join("\n");
}

async function cmdHistory({ address, limit = 50, source = "auto", mode = "all" }) {
  const { source: used, items } = await fetchNormalBySource(address, { source, limit });
  let rows = items;
  if (mode === "incoming") rows = rows.filter((x) => toDirection({ from: x.from, to: x.to, address }) === "IN");
  if (mode === "outgoing") rows = rows.filter((x) => toDirection({ from: x.from, to: x.to, address }) === "OUT");

  const lines = [];
  lines.push(`HyperEVM ${mode === "all" ? "history" : mode} (${renderAddress(address)})`);
  lines.push(`- source: ${used}`);
  if (!rows.length) {
    lines.push("- none");
    return lines.join("\n");
  }
  for (const row of rows.slice(0, limit)) lines.push(formatNormalLine(row, address));
  return lines.join("\n");
}

async function cmdInternal({ address, limit = 50, source = "auto" }) {
  const { source: used, items } = await fetchInternalBySource(address, { source, limit });
  const lines = [];
  lines.push(`HyperEVM internal txs (${renderAddress(address)})`);
  lines.push(`- source: ${used}`);
  if (!items.length) {
    lines.push("- none");
    return lines.join("\n");
  }
  for (const row of items.slice(0, limit)) lines.push(formatInternalLine(row, address));
  return lines.join("\n");
}

async function cmdTokens({ address, limit = 50, source = "auto" }) {
  const { source: used, items } = await fetchTokenBySource(address, { source, limit });
  const lines = [];
  lines.push(`HyperEVM token transfers (${renderAddress(address)})`);
  lines.push(`- source: ${used}`);
  if (!items.length) {
    lines.push("- none");
    return lines.join("\n");
  }
  for (const row of items.slice(0, limit)) lines.push(formatTokenLine(row, address));
  return lines.join("\n");
}

async function cmdAll({ address, limit = 25, source = "auto" }) {
  const [normal, internal, token] = await Promise.all([
    fetchNormalBySource(address, { source, limit }),
    fetchInternalBySource(address, { source, limit }),
    fetchTokenBySource(address, { source, limit }),
  ]);

  // Coin balance deltas are currently available from Hyperscan endpoint.
  let deltas = [];
  if (normal.source === "hyperscan") {
    deltas = await hyperscanCollectPaged(
      (pageParams) => hyperscanAddressCoinBalanceHistory({ address, pageParams }),
      { maxItems: limit, maxPages: Math.max(1, Math.ceil(limit / 50) + 1) }
    );
  }

  const lines = [];
  lines.push(`HyperEVM all activity (${renderAddress(address)})`);
  lines.push(`- source(normal/internal/tokens): ${normal.source}/${internal.source}/${token.source}`);
  lines.push(`- normal txs: ${normal.items.length}`);
  lines.push(`- internal txs: ${internal.items.length}`);
  lines.push(`- token transfers: ${token.items.length}`);
  lines.push(`- coin balance deltas: ${deltas.length}`);

  lines.push("");
  lines.push("Recent normal txs:");
  if (!normal.items.length) lines.push("- none");
  for (const row of normal.items.slice(0, Math.min(limit, 10))) lines.push(formatNormalLine(row, address));

  lines.push("");
  lines.push("Recent token transfers:");
  if (!token.items.length) lines.push("- none");
  for (const row of token.items.slice(0, Math.min(limit, 10))) lines.push(formatTokenLine(row, address));

  return lines.join("\n");
}

function parseHexWei(hexWei) {
  try {
    if (!hexWei || hexWei === "0x") return "0";
    return BigInt(hexWei).toString(10);
  } catch {
    return "0";
  }
}

async function cmdTx({ hash }) {
  const rawHash = String(hash ?? "").trim();
  const truncated = truncatedHashCandidate(rawHash);
  if (truncated) {
    throw new Error(`Truncated tx hash provided (${truncated}). Use the full 66-char tx hash from history output.`);
  }
  const txHash = assertTxHash(rawHash);

  const [scanTx, rpcTx, receipt] = await Promise.all([
    hyperscanTransaction(txHash).catch(() => null),
    rpcGetTransactionByHash(txHash).catch(() => null),
    rpcGetTransactionReceipt(txHash).catch(() => null),
  ]);

  const lines = [];
  lines.push("HyperEVM tx inspection");
  lines.push(`- hash: ${txHash}`);
  lines.push(`- tx link: ${txLink(txHash)}`);

  if (scanTx) {
    lines.push(`- source: hyperscan`);
    lines.push(`- block: ${scanTx.block_number ?? "n/a"}`);
    lines.push(`- timestamp: ${fmtTs(scanTx.timestamp)}`);
    lines.push(`- from: ${scanTx.from?.hash ?? "n/a"}`);
    lines.push(`- to: ${scanTx.to?.hash ?? "n/a"}`);
    lines.push(`- value: ${formatUnits(scanTx.value ?? "0", 18, { precision: 8 })} HYPE`);
    lines.push(`- status: ${scanTx.status ?? "n/a"}`);
    lines.push(`- method: ${scanTx.method ?? "n/a"}`);
    lines.push(`- fee: ${formatUnits(scanTx.fee?.value ?? "0", 18, { precision: 8 })} HYPE`);
  } else {
    lines.push("- source: hyperscan unavailable for this tx");
  }

  if (rpcTx) {
    lines.push(`- rpc from: ${rpcTx.from ?? "n/a"}`);
    lines.push(`- rpc to: ${rpcTx.to ?? "n/a"}`);
    lines.push(`- rpc value: ${formatUnits(parseHexWei(rpcTx.value), 18, { precision: 8 })} HYPE`);
    lines.push(`- rpc nonce: ${rpcTx.nonce ? Number.parseInt(rpcTx.nonce, 16) : "n/a"}`);
  }

  if (receipt) {
    const ok = receipt.status ? Number.parseInt(receipt.status, 16) === 1 : null;
    lines.push(`- receipt status: ${ok == null ? "n/a" : ok ? "success" : "revert"}`);
    lines.push(`- gas used: ${receipt.gasUsed ? Number.parseInt(receipt.gasUsed, 16) : "n/a"}`);
    if (receipt.contractAddress) lines.push(`- created contract: ${receipt.contractAddress}`);
  }

  return lines.join("\n");
}

async function cmdExplainInflow({ address, lookback = 50, source = "auto" }) {
  const [normal, token, internal] = await Promise.all([
    fetchNormalBySource(address, { source, limit: lookback }),
    fetchTokenBySource(address, { source, limit: lookback }),
    fetchInternalBySource(address, { source, limit: lookback }),
  ]);

  const incomingNormal = normal.items.filter((x) => toDirection({ from: x.from, to: x.to, address }) === "IN");
  const incomingTokens = token.items.filter((x) => toDirection({ from: x.from, to: x.to, address }) === "IN");
  const incomingInternal = internal.items.filter((x) => toDirection({ from: x.from, to: x.to, address }) === "IN");

  const lines = [];
  lines.push(`HyperEVM inflow analysis (${renderAddress(address)})`);
  lines.push(`- lookback: ${lookback}`);
  lines.push(`- incoming normal txs: ${incomingNormal.length}`);
  lines.push(`- incoming internal txs: ${incomingInternal.length}`);
  lines.push(`- incoming token transfers: ${incomingTokens.length}`);

  if (!incomingNormal.length && !incomingInternal.length && !incomingTokens.length) {
    lines.push("- no inbound activity found in lookback window");
    return lines.join("\n");
  }

  // Simple confidence heuristic.
  const nativeIn = incomingNormal.find((x) => {
    try {
      return BigInt(String(x.valueWei ?? "0")) > 0n;
    } catch {
      return false;
    }
  });

  if (nativeIn) {
    lines.push("- likely source: direct native transfer");
    lines.push("- confidence: high");
    lines.push(`- evidence: ${formatNormalLine(nativeIn, address)}`);
    return lines.join("\n");
  }

  if (incomingTokens.length) {
    const t = incomingTokens[0];
    lines.push("- likely source: token transfer event (distribution/contract/user transfer)");
    lines.push("- confidence: medium");
    lines.push(`- evidence: ${formatTokenLine(t, address)}`);
    return lines.join("\n");
  }

  const i = incomingInternal[0];
  lines.push("- likely source: contract-mediated internal value movement");
  lines.push("- confidence: medium");
  lines.push(`- evidence: ${formatInternalLine(i, address)}`);
  return lines.join("\n");
}

async function cmdAccount(args) {
  const sub = String(args._[1] ?? "list").toLowerCase();
  const tail = args._.slice(2);

  const parseLabelAndAddress = () => {
    if (!tail.length) return { label: "", addr: "" };
    const addrIdx = tail.findIndex((t) => !!extractEvmAddress(t));
    if (addrIdx < 0) return { label: tail.join(" ").trim(), addr: "" };
    const label = tail.slice(0, addrIdx).join(" ").trim();
    const addr = tail[addrIdx];
    return { label, addr };
  };

  const { label, addr } = parseLabelAndAddress();

  if (sub === "list") {
    const cfg = await loadConfig();
    const keys = Object.keys(cfg.accounts || {}).sort();
    const lines = [];
    lines.push("HyperEVM saved accounts");
    if (!keys.length) {
      lines.push("- none");
      return lines.join("\n");
    }
    for (const k of keys) {
      const suffix = cfg.defaultAccount === k ? " (default)" : "";
      lines.push(`- ${k}: ${cfg.accounts[k]}${suffix}`);
    }
    return lines.join("\n");
  }

  if (sub === "add") {
    if (!label || !addr) throw new Error('Usage: hype account add "main wallet" HL:0x... [--default]');
    await setAccountAlias({ label, address: addr, makeDefault: Boolean(args.default) });
    return `Saved ${renderAddress(addr)} as "${label}"${args.default ? " (default)" : ""}`;
  }

  if (sub === "remove" || sub === "rm" || sub === "delete" || sub === "del") {
    const removeLabel = tail.join(" ").trim();
    if (!removeLabel) throw new Error('Usage: hype account remove "main wallet"');
    await removeAccountAlias({ label: removeLabel });
    return `Removed saved account "${removeLabel}"`;
  }

  if (sub === "default") {
    const defaultLabel = tail.join(" ").trim();
    if (!defaultLabel) throw new Error('Usage: hype account default "main wallet"');
    await setDefaultAccount({ label: defaultLabel });
    return `Default account set to "${defaultLabel}"`;
  }

  throw new Error(`Unknown account subcommand: ${sub}`);
}

function usage() {
  return [
    'Usage: hype "<command>"',
    "Commands:",
    "  network",
    "  recent [--limit N]",
    "  quote <coin>",
    "  positions <address|label>",
    "  transact-help",
    "  transfer-plan <from|label> <to> --amount <decimal>",
    "  history <address|label> [--limit N] [--source auto|hyperscan|etherscan]",
    "  incoming <address|label> [--limit N] [--source ...]",
    "  outgoing <address|label> [--limit N] [--source ...]",
    "  internal <address|label> [--limit N] [--source ...]",
    "  tokens <address|label> [--limit N] [--source ...]",
    "  all <address|label> [--limit N] [--source ...]",
    "  tx <hash>",
    "  explain-inflow <address|label> [--lookback N] [--source ...]",
    '  account add "main wallet" HL:0x... [--default]',
    "  account list|remove|default ...",
    "",
    "Notes:",
    "  - transaction/history outputs include full addresses and full tx hashes by default",
    "  - never reconstruct addresses from shortened text",
  ].join("\n");
}

async function runDeterministic(pref) {
  const tokens = tokenize(pref);
  const args = parseArgs(tokens);
  const cmd = String(args._[0] ?? "network").toLowerCase();
  const ref = extractAddress(pref) || args._.slice(1).join(" ").trim();
  const tx = extractTxHash(pref) || args._[1] || "";
  const source = normalizeSource(args.source ?? "auto");
  const limit = intArg(args.limit ?? args.n ?? 50, 50, { min: 1, max: 500 });
  const lookback = intArg(args.lookback ?? args.limit ?? 50, 50, { min: 1, max: 500 });

  if (cmd === "help" || cmd === "usage") return usage();
  if (cmd === "network") return cmdNetwork();
  if (cmd === "recent") return cmdRecent({ limit });
  if (cmd === "quote") return cmdQuote({ coin: args._[1] ?? "BTC" });
  if (cmd === "positions") {
    const address = await resolveAddressInput(ref);
    return cmdPositions({ address });
  }
  if (cmd === "transact-help") return cmdTransactHelp();
  if (cmd === "account") return cmdAccount(args);

  if (cmd === "transfer-plan") {
    const { fromRef, toAddress } = splitFromToRef(args._.slice(1));
    return cmdTransferPlan({
      fromRef,
      toAddress,
      amount: args.amount,
    });
  }

  if (cmd === "tx") return cmdTx({ hash: tx });

  if (cmd === "history" || cmd === "incoming" || cmd === "outgoing" || cmd === "internal" || cmd === "tokens" || cmd === "all" || cmd === "explain-inflow") {
    const address = await resolveAddressInput(ref);
    if (cmd === "history") return cmdHistory({ address, limit, source, mode: "all" });
    if (cmd === "incoming") return cmdHistory({ address, limit, source, mode: "incoming" });
    if (cmd === "outgoing") return cmdHistory({ address, limit, source, mode: "outgoing" });
    if (cmd === "internal") return cmdInternal({ address, limit, source });
    if (cmd === "tokens") return cmdTokens({ address, limit, source });
    if (cmd === "all") return cmdAll({ address, limit, source });
    if (cmd === "explain-inflow") return cmdExplainInflow({ address, lookback, source });
  }

  throw new Error(`Unknown command: ${cmd}`);
}

async function runNL(raw) {
  const { cmd } = guessIntentFromNL(raw);

  if (cmd === "account-save") {
    const addr = extractAddress(raw);
    const m = raw.match(/\bas\s+(.+)$/i);
    const label = m ? m[1].trim() : null;
    if (!addr || !label) throw new Error('Usage: "store this address HL:0x... as main wallet"');
    await setAccountAlias({ label, address: addr });
    return `Saved ${renderAddress(addr)} as "${label}"`;
  }

  if (cmd === "account-list") {
    return cmdAccount({ _: ["account", "list"] });
  }

  if (cmd === "network") return cmdNetwork();
  if (cmd === "recent") return cmdRecent({ limit: 20 });
  if (cmd === "transact-help") return cmdTransactHelp();
  if (cmd === "quote") return cmdQuote({ coin: extractCoin(raw) ?? "BTC" });

  const addr = extractAddress(raw);
  const hash = extractTxHash(raw);
  const labelGuess = addr
    ? ""
    : (raw.match(/\b(?:for|of)\s+(.+)$/i)?.[1] ?? "").trim();

  if (cmd === "tx") return cmdTx({ hash });
  if (cmd === "transfer-plan") {
    const found = [...raw.matchAll(/(?:HL:)?(0x[a-fA-F0-9]{40})/g)].map((m) => m[1]);
    const fromRef = found.length >= 2 ? found[0] : "";
    const toAddress = found.length >= 2 ? found[1] : found[0] || "";
    const amountMatch = raw.match(/(?:amount|send|transfer|value)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i) || raw.match(/\b(\d+(?:\.\d+)?)\s*(?:hype|eth)\b/i);
    const amount = amountMatch ? amountMatch[1] : null;
    return cmdTransferPlan({ fromRef, toAddress, amount });
  }

  const resolved = await resolveAccountRef(addr || labelGuess || "");
  const address = resolved.address || (await resolveAddressInput(""));

  if (cmd === "positions") return cmdPositions({ address });
  if (cmd === "incoming") return cmdHistory({ address, limit: 25, source: "auto", mode: "incoming" });
  if (cmd === "outgoing") return cmdHistory({ address, limit: 25, source: "auto", mode: "outgoing" });
  if (cmd === "internal") return cmdInternal({ address, limit: 25, source: "auto" });
  if (cmd === "tokens") return cmdTokens({ address, limit: 25, source: "auto" });
  if (cmd === "all") return cmdAll({ address, limit: 20, source: "auto" });
  if (cmd === "explain-inflow") return cmdExplainInflow({ address, lookback: 40, source: "auto" });
  return cmdHistory({ address, limit: 25, source: "auto", mode: "all" });
}

async function main() {
  const raw = process.argv.slice(2).join(" ").trim();
  if (!raw) {
    console.log(usage());
    process.exit(0);
  }

  const pref = stripPrefix(raw);
  const output = pref != null ? await runDeterministic(pref) : await runNL(raw);
  console.log(output);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
