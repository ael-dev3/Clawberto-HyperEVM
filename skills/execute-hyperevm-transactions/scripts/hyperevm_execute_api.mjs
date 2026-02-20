// HyperEVM execution helpers.
// This module handles preflight checks, cast integration, and RPC broadcast/receipt helpers.

import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export const DEFAULT_CHAIN_ID = String(process.env.HYPEREVM_CHAIN_ID || "999");
export const DEFAULT_RPC_URL = process.env.HYPEREVM_RPC_URL || "https://rpc.hyperliquid.xyz/evm";
export const DEFAULT_TIMEOUT_MS = Number(process.env.HYPEREVM_TIMEOUT_MS || 12_000);
export const DEFAULT_BROADCAST_TIMEOUT_MS = Number(process.env.HYPEREVM_BROADCAST_TIMEOUT_MS || 120_000);

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

export function normalizeAddress(addr) {
  const m = String(addr ?? "").match(/(?:HL:)?(0x[a-fA-F0-9]{40})/);
  return m ? m[1].toLowerCase() : null;
}

export function assertAddress(addr) {
  const a = normalizeAddress(addr);
  if (!a) throw new Error("Invalid address. Expected HL:0x... or 0x... (40 hex chars).");
  return a;
}

export function normalizeTxHash(hash) {
  const m = String(hash ?? "").match(/(0x[a-fA-F0-9]{64})/);
  return m ? m[1].toLowerCase() : null;
}

export function assertTxHash(hash) {
  const h = normalizeTxHash(hash);
  if (!h) throw new Error("Invalid tx hash. Expected 0x + 64 hex chars.");
  return h;
}

export function shortAddress(addr) {
  const a = normalizeAddress(addr);
  if (!a) return String(addr ?? "");
  return `${a.slice(0, 8)}...${a.slice(-6)}`;
}

export function shortHash(hash) {
  const h = normalizeTxHash(hash);
  if (!h) return String(hash ?? "");
  return `${h.slice(0, 10)}...${h.slice(-8)}`;
}

export function txLink(hash) {
  const h = normalizeTxHash(hash);
  return h ? `https://www.hyperscan.com/tx/${h}` : null;
}

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

export function parseDecimalToUnits(amount, decimals = 18) {
  const s = String(amount ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid decimal amount: ${amount}`);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places for ${decimals}-decimals asset`);
  }
  const w = BigInt(whole || "0");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const f = BigInt(fracPadded || "0");
  return w * 10n ** BigInt(decimals) + f;
}

export function toHexQuantity(value) {
  try {
    const n = typeof value === "bigint" ? value : BigInt(String(value ?? "0"));
    if (n < 0n) throw new Error("Negative values are not allowed");
    return `0x${n.toString(16)}`;
  } catch {
    throw new Error(`Invalid numeric value for hex quantity: ${value}`);
  }
}

function parseHexToBigInt(hex) {
  try {
    if (!hex || hex === "0x") return 0n;
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

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

export async function rpcGetBalance(address, blockTag = "latest", opts = {}) {
  return rpcCall("eth_getBalance", [assertAddress(address), blockTag], opts);
}

export async function rpcGetTransactionCount(address, blockTag = "pending", opts = {}) {
  return rpcCall("eth_getTransactionCount", [assertAddress(address), blockTag], opts);
}

export async function rpcGasPrice(opts = {}) {
  return rpcCall("eth_gasPrice", [], opts);
}

export async function rpcEstimateGas(tx, opts = {}) {
  return rpcCall("eth_estimateGas", [tx], opts);
}

export async function rpcSendRawTransaction(signedTx, opts = {}) {
  const raw = String(signedTx ?? "").trim();
  if (!/^0x[0-9a-fA-F]+$/.test(raw)) throw new Error("Invalid signed tx payload. Expected 0x-prefixed hex.");
  if (raw.length < 120) throw new Error("Signed tx payload is too short. Provide the complete raw signed transaction.");
  return rpcCall("eth_sendRawTransaction", [raw], opts);
}

export async function rpcGetTransactionReceipt(hash, opts = {}) {
  return rpcCall("eth_getTransactionReceipt", [assertTxHash(hash)], opts);
}

export async function waitForReceipt(hash, { rpcUrl = DEFAULT_RPC_URL, timeoutMs = DEFAULT_BROADCAST_TIMEOUT_MS, pollMs = 2_000 } = {}) {
  const txHash = assertTxHash(hash);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = await rpcGetTransactionReceipt(txHash, { rpcUrl });
    if (receipt) return receipt;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for receipt after ${Math.floor(timeoutMs / 1000)}s`);
}

export async function preflightNativeTransfer({ from, to, amountDecimal, rpcUrl = DEFAULT_RPC_URL } = {}) {
  const fromAddress = assertAddress(from);
  const toAddress = assertAddress(to);
  const valueWei = parseDecimalToUnits(amountDecimal, 18);
  const valueHex = toHexQuantity(valueWei);

  const [chain, balanceHex, nonceHex, gasPriceHex, gasLimitHex] = await Promise.all([
    rpcChainId({ rpcUrl }),
    rpcGetBalance(fromAddress, "latest", { rpcUrl }),
    rpcGetTransactionCount(fromAddress, "pending", { rpcUrl }),
    rpcGasPrice({ rpcUrl }),
    rpcEstimateGas({ from: fromAddress, to: toAddress, value: valueHex }, { rpcUrl }).catch(() => "0x5208"),
  ]);

  const balanceWei = parseHexToBigInt(balanceHex);
  const gasPriceWei = parseHexToBigInt(gasPriceHex);
  const gasLimit = parseHexToBigInt(gasLimitHex || "0x5208");
  const nonce = Number.parseInt(nonceHex || "0x0", 16);
  const estimatedFeeWei = gasLimit * gasPriceWei;
  const totalRequiredWei = valueWei + estimatedFeeWei;
  const enoughFunds = balanceWei >= totalRequiredWei;

  return {
    fromAddress,
    toAddress,
    amountDecimal,
    chainIdHex: chain.hex,
    chainIdDecimal: chain.decimal,
    valueWei,
    valueHex,
    balanceWei,
    nonce,
    gasPriceWei,
    gasLimit,
    estimatedFeeWei,
    totalRequiredWei,
    enoughFunds,
  };
}

function runCast(args, { timeoutMs = DEFAULT_BROADCAST_TIMEOUT_MS } = {}) {
  const out = spawnSync("cast", args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (out.error) {
    if (out.error.code === "ENOENT") {
      throw new Error("Foundry `cast` not found in PATH. Install Foundry first: https://book.getfoundry.sh/getting-started/installation");
    }
    throw new Error(`Failed to run cast: ${out.error.message}`);
  }

  if (out.status !== 0) {
    const reason = String(out.stderr || out.stdout || "unknown cast error").trim();
    throw new Error(`cast ${args[0]} failed: ${reason.slice(0, 500)}`);
  }

  return { stdout: out.stdout || "", stderr: out.stderr || "" };
}

export async function castVersion() {
  const { stdout } = runCast(["--version"], { timeoutMs: 5_000 });
  return String(stdout || "").trim();
}

export async function castWalletAddressFromPrivateKey(privateKey, { timeoutMs = 10_000 } = {}) {
  const pk = String(privateKey ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("Invalid private key format. Expected 0x + 64 hex chars.");
  }
  const { stdout } = runCast(["wallet", "address", "--private-key", pk], { timeoutMs });
  const m = String(stdout).match(/0x[a-fA-F0-9]{40}/);
  if (!m) throw new Error("Unable to derive wallet address from private key via cast.");
  return m[0].toLowerCase();
}

function extractTxHash(text) {
  const m = String(text ?? "").match(/0x[a-fA-F0-9]{64}/);
  return m ? m[0].toLowerCase() : null;
}

export async function sendNativeWithCast({
  to,
  amountDecimal,
  rpcUrl = DEFAULT_RPC_URL,
  chainId = DEFAULT_CHAIN_ID,
  privateKey,
  nonce,
  gasLimit,
  gasPriceWei,
  legacy = false,
  timeoutMs = DEFAULT_BROADCAST_TIMEOUT_MS,
} = {}) {
  const destination = assertAddress(to);
  const amount = String(amountDecimal ?? "").trim();
  if (!amount) throw new Error("Missing amount.");

  const pk = String(privateKey ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("Invalid private key format. Expected 0x + 64 hex chars.");
  }

  const args = [
    "send",
    destination,
    "--value",
    `${amount}ether`,
    "--rpc-url",
    rpcUrl,
    "--chain",
    String(chainId),
    "--private-key",
    pk,
    "--json",
  ];

  if (Number.isFinite(Number(nonce))) args.push("--nonce", String(nonce));
  if (gasLimit != null) args.push("--gas-limit", String(gasLimit));
  if (gasPriceWei != null) args.push("--gas-price", String(gasPriceWei));
  if (legacy) args.push("--legacy");

  const { stdout, stderr } = runCast(args, { timeoutMs });
  const raw = String(stdout || "").trim();

  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const hash =
    normalizeTxHash(parsed?.transactionHash) ||
    normalizeTxHash(parsed?.hash) ||
    normalizeTxHash(parsed?.txHash) ||
    extractTxHash(`${stdout}\n${stderr}`);

  return { stdout, stderr, parsed, hash };
}

export function renderCastSendPreview({
  to,
  amountDecimal,
  rpcUrl = DEFAULT_RPC_URL,
  chainId = DEFAULT_CHAIN_ID,
  pkEnv = "HYPEREVM_EXEC_PRIVATE_KEY",
  nonce,
  gasLimit,
  gasPriceWei,
  legacy = false,
} = {}) {
  const args = [
    "cast send",
    assertAddress(to),
    "--value",
    `${String(amountDecimal ?? "").trim()}ether`,
    "--rpc-url",
    rpcUrl,
    "--chain",
    String(chainId),
    "--private-key",
    `$${pkEnv}`,
  ];
  if (Number.isFinite(Number(nonce))) args.push("--nonce", String(nonce));
  if (gasLimit != null) args.push("--gas-limit", String(gasLimit));
  if (gasPriceWei != null) args.push("--gas-price", String(gasPriceWei));
  if (legacy) args.push("--legacy");
  return args.join(" ");
}

export function receiptStatus(receipt) {
  if (!receipt?.status) return null;
  try {
    return Number.parseInt(receipt.status, 16) === 1;
  } catch {
    return null;
  }
}
