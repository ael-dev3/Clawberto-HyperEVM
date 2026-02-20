// HyperEVM transaction tracing API helpers (read-only).
// Node >=18 assumed (global fetch).

export const DEFAULT_CHAIN_ID = String(process.env.HYPEREVM_CHAIN_ID || "999");
export const DEFAULT_RPC_URL = process.env.HYPEREVM_RPC_URL || "https://rpc.hyperliquid.xyz/evm";
export const DEFAULT_TIMEOUT_MS = Number(process.env.HYPEREVM_TIMEOUT_MS || 12_000);
export const DEFAULT_HYPERSCAN_API_URL = process.env.HYPERSCAN_API_URL || "https://www.hyperscan.com/api/v2";
export const DEFAULT_ETHERSCAN_API_URL = process.env.ETHERSCAN_API_URL || "https://api.etherscan.io/v2/api";

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

async function fetchJson(url, { method = "GET", headers, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { controller, done } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: headers || {},
      body,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : null;
  } finally {
    done();
  }
}

function normalizeApiBase(base) {
  return String(base || "").endsWith("/") ? String(base) : `${String(base)}/`;
}

export function normalizeAddress(addr) {
  const m = String(addr ?? "").match(/(?:HL:)?(0x[a-fA-F0-9]{40})/);
  return m ? m[1].toLowerCase() : null;
}

export function normalizeTxHash(hash) {
  const m = String(hash ?? "").match(/(0x[a-fA-F0-9]{64})/);
  return m ? m[1].toLowerCase() : null;
}

export function assertAddress(addr) {
  const a = normalizeAddress(addr);
  if (!a) throw new Error("Invalid address. Expected HL:0x... or 0x... (40 hex chars).");
  return a;
}

export function assertTxHash(hash) {
  const h = normalizeTxHash(hash);
  if (!h) throw new Error("Invalid tx hash. Expected 0x + 64 hex chars.");
  return h;
}

function addressFromAny(value) {
  if (!value) return null;
  if (typeof value === "string") return normalizeAddress(value);
  if (typeof value === "object") return normalizeAddress(value.hash || value.address || value.from || value.to);
  return null;
}

function toIsoTimestamp(value) {
  if (value == null) return null;
  if (typeof value === "number") {
    // Numeric inputs from Etherscan are unix seconds.
    return new Date(value * 1000).toISOString();
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000).toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function hasEtherscanKey() {
  const key = String(process.env.ETHERSCAN_API_KEY || "").trim();
  if (!key) return false;
  return key.toLowerCase() !== "yourapikeytoken";
}

function requireEtherscanKey() {
  if (!hasEtherscanKey()) {
    throw new Error(
      "ETHERSCAN_API_KEY is required for Etherscan source. Set ETHERSCAN_API_KEY and retry, or use --source hyperscan."
    );
  }
  return String(process.env.ETHERSCAN_API_KEY).trim();
}

function buildUrl(base, path = "", params = {}) {
  const url = new URL(path.replace(/^\/+/, ""), normalizeApiBase(base));
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

// ------------------------
// RPC (HyperEVM mainnet)
// ------------------------

export async function rpcCall(method, params = [], { rpcUrl = DEFAULT_RPC_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const payload = { jsonrpc: "2.0", id: 1, method, params };
  const data = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs,
  });
  if (data?.error) {
    throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  }
  return data?.result;
}

export async function rpcChainId(opts = {}) {
  const hex = await rpcCall("eth_chainId", [], opts);
  return { hex, decimal: Number.parseInt(hex, 16) };
}

export async function rpcBlockNumber(opts = {}) {
  const hex = await rpcCall("eth_blockNumber", [], opts);
  return { hex, decimal: Number.parseInt(hex, 16) };
}

export async function rpcGetTransactionByHash(hash, opts = {}) {
  return rpcCall("eth_getTransactionByHash", [assertTxHash(hash)], opts);
}

export async function rpcGetTransactionReceipt(hash, opts = {}) {
  return rpcCall("eth_getTransactionReceipt", [assertTxHash(hash)], opts);
}

// ------------------------
// Hyperscan (Blockscout API v2)
// ------------------------

export async function hyperscanGet(path, params = {}, { baseUrl = DEFAULT_HYPERSCAN_API_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = buildUrl(baseUrl, path, params);
  return fetchJson(url, { timeoutMs });
}

export async function hyperscanAddress(address, opts = {}) {
  return hyperscanGet(`/addresses/${assertAddress(address)}`, {}, opts);
}

export async function hyperscanAddressTransactions({ address, pageParams = null } = {}, opts = {}) {
  return hyperscanGet(`/addresses/${assertAddress(address)}/transactions`, pageParams || {}, opts);
}

export async function hyperscanAddressInternalTransactions({ address, pageParams = null } = {}, opts = {}) {
  return hyperscanGet(`/addresses/${assertAddress(address)}/internal-transactions`, pageParams || {}, opts);
}

export async function hyperscanAddressTokenTransfers({ address, pageParams = null } = {}, opts = {}) {
  return hyperscanGet(`/addresses/${assertAddress(address)}/token-transfers`, pageParams || {}, opts);
}

export async function hyperscanAddressCoinBalanceHistory({ address, pageParams = null } = {}, opts = {}) {
  return hyperscanGet(`/addresses/${assertAddress(address)}/coin-balance-history`, pageParams || {}, opts);
}

export async function hyperscanTransaction(hash, opts = {}) {
  return hyperscanGet(`/transactions/${assertTxHash(hash)}`, {}, opts);
}

export async function hyperscanRecentTransactions({ pageParams = null } = {}, opts = {}) {
  return hyperscanGet("/transactions", pageParams || {}, opts);
}

export function hasNextPage(nextPageParams) {
  return !!(nextPageParams && typeof nextPageParams === "object" && Object.keys(nextPageParams).length > 0);
}

export async function hyperscanCollectPaged(fetchPage, { maxItems = 50, maxPages = 1 } = {}) {
  const items = [];
  let pageParams = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(pageParams);
    const rows = Array.isArray(page?.items) ? page.items : [];
    items.push(...rows);
    if (items.length >= maxItems) break;
    if (!hasNextPage(page?.next_page_params)) break;
    pageParams = page.next_page_params;
  }
  return items.slice(0, maxItems);
}

// ------------------------
// Etherscan V2 (chainid=999)
// ------------------------

async function etherscanQuery(params = {}, { baseUrl = DEFAULT_ETHERSCAN_API_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const apiKey = requireEtherscanKey();
  const merged = { chainid: DEFAULT_CHAIN_ID, ...params, apikey: apiKey };
  const url = buildUrl(baseUrl, "", merged);
  const data = await fetchJson(url, { timeoutMs });

  const status = String(data?.status ?? "");
  const result = data?.result;
  const resultText = typeof result === "string" ? result : "";
  const isEmpty = resultText.toLowerCase().includes("no transactions found");
  if (status === "0" && !isEmpty) {
    throw new Error(`Etherscan error: ${resultText || JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

export async function etherscanTxList({
  address,
  startblock = 0,
  endblock = 99999999,
  page = 1,
  offset = 100,
  sort = "desc",
} = {}) {
  const data = await etherscanQuery({
    module: "account",
    action: "txlist",
    address: assertAddress(address),
    startblock,
    endblock,
    page,
    offset,
    sort,
  });
  return Array.isArray(data?.result) ? data.result : [];
}

export async function etherscanInternalTxList({
  address,
  startblock = 0,
  endblock = 99999999,
  page = 1,
  offset = 100,
  sort = "desc",
} = {}) {
  const data = await etherscanQuery({
    module: "account",
    action: "txlistinternal",
    address: assertAddress(address),
    startblock,
    endblock,
    page,
    offset,
    sort,
  });
  return Array.isArray(data?.result) ? data.result : [];
}

export async function etherscanTokenTxList({
  address,
  startblock = 0,
  endblock = 99999999,
  page = 1,
  offset = 100,
  sort = "desc",
} = {}) {
  const data = await etherscanQuery({
    module: "account",
    action: "tokentx",
    address: assertAddress(address),
    startblock,
    endblock,
    page,
    offset,
    sort,
  });
  return Array.isArray(data?.result) ? data.result : [];
}

export async function etherscanBalance({ address, tag = "latest" } = {}) {
  const data = await etherscanQuery({
    module: "account",
    action: "balance",
    address: assertAddress(address),
    tag,
  });
  return data?.result ?? null;
}

// ------------------------
// Normalization helpers
// ------------------------

export function toDirection({ from, to, address }) {
  const a = normalizeAddress(address);
  const f = normalizeAddress(from);
  const t = normalizeAddress(to);
  if (a && t && a === t) return "IN";
  if (a && f && a === f) return "OUT";
  return "OTHER";
}

export function normalizeNormalTx(row, { source }) {
  if (source === "hyperscan") {
    return {
      kind: "normal",
      source,
      hash: normalizeTxHash(row?.hash),
      blockNumber: Number(row?.block_number),
      timestamp: toIsoTimestamp(row?.timestamp),
      from: addressFromAny(row?.from),
      to: addressFromAny(row?.to),
      valueWei: row?.value ?? "0",
      status: row?.status ?? null,
      method: row?.method ?? null,
    };
  }

  return {
    kind: "normal",
    source: "etherscan",
    hash: normalizeTxHash(row?.hash),
    blockNumber: Number(row?.blockNumber),
    timestamp: toIsoTimestamp(row?.timeStamp),
    from: normalizeAddress(row?.from),
    to: normalizeAddress(row?.to),
    valueWei: row?.value ?? "0",
    status: String(row?.isError) === "1" ? "error" : "ok",
    method: row?.functionName || row?.methodId || null,
  };
}

export function normalizeInternalTx(row, { source }) {
  if (source === "hyperscan") {
    return {
      kind: "internal",
      source,
      hash: normalizeTxHash(row?.transaction_hash),
      blockNumber: Number(row?.block_number),
      timestamp: toIsoTimestamp(row?.timestamp),
      from: addressFromAny(row?.from),
      to: addressFromAny(row?.to),
      valueWei: row?.value ?? "0",
      status: row?.success === false ? "error" : "ok",
      method: row?.type ?? null,
    };
  }

  return {
    kind: "internal",
    source: "etherscan",
    hash: normalizeTxHash(row?.hash),
    blockNumber: Number(row?.blockNumber),
    timestamp: toIsoTimestamp(row?.timeStamp),
    from: normalizeAddress(row?.from),
    to: normalizeAddress(row?.to),
    valueWei: row?.value ?? "0",
    status: String(row?.isError) === "1" ? "error" : "ok",
    method: row?.type ?? null,
  };
}

export function normalizeTokenTransfer(row, { source }) {
  if (source === "hyperscan") {
    return {
      kind: "token",
      source,
      hash: normalizeTxHash(row?.transaction_hash),
      blockNumber: Number(row?.block_number),
      timestamp: toIsoTimestamp(row?.timestamp),
      from: addressFromAny(row?.from),
      to: addressFromAny(row?.to),
      tokenSymbol: row?.token?.symbol ?? null,
      tokenAddress: normalizeAddress(row?.token?.address_hash),
      tokenDecimals: Number(row?.token?.decimals ?? row?.total?.decimals ?? 18),
      tokenValueRaw: row?.total?.value ?? "0",
      method: row?.method ?? null,
    };
  }

  return {
    kind: "token",
    source: "etherscan",
    hash: normalizeTxHash(row?.hash),
    blockNumber: Number(row?.blockNumber),
    timestamp: toIsoTimestamp(row?.timeStamp),
    from: normalizeAddress(row?.from),
    to: normalizeAddress(row?.to),
    tokenSymbol: row?.tokenSymbol ?? null,
    tokenAddress: normalizeAddress(row?.contractAddress),
    tokenDecimals: Number(row?.tokenDecimal ?? 18),
    tokenValueRaw: row?.value ?? "0",
    method: row?.functionName || row?.methodId || null,
  };
}

// ------------------------
// Formatting helpers
// ------------------------

export function formatUnits(raw, decimals = 18, { precision = 6 } = {}) {
  try {
    const d = Number.isFinite(Number(decimals)) ? Number(decimals) : 18;
    const n = BigInt(String(raw ?? "0"));
    const neg = n < 0n;
    const abs = neg ? -n : n;
    const base = 10n ** BigInt(d);
    const whole = abs / base;
    const frac = abs % base;

    if (precision <= 0 || d === 0) return `${neg ? "-" : ""}${whole.toString()}`;

    const fracStrFull = frac.toString().padStart(d, "0");
    const sliced = fracStrFull.slice(0, Math.min(precision, d)).replace(/0+$/, "");
    return `${neg ? "-" : ""}${whole.toString()}${sliced ? `.${sliced}` : ""}`;
  } catch {
    return String(raw ?? "");
  }
}

export function shortHash(hash) {
  const h = normalizeTxHash(hash);
  if (!h) return String(hash ?? "");
  return `${h.slice(0, 10)}...${h.slice(-8)}`;
}

export function shortAddress(addr) {
  const a = normalizeAddress(addr);
  if (!a) return String(addr ?? "");
  return `${a.slice(0, 8)}...${a.slice(-6)}`;
}

export function txLink(hash) {
  const h = normalizeTxHash(hash);
  return h ? `https://www.hyperscan.com/tx/${h}` : null;
}

export function addressLink(address) {
  const a = normalizeAddress(address);
  return a ? `https://www.hyperscan.com/address/${a}` : null;
}
