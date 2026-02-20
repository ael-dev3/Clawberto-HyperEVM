// Store per-user settings (wallet aliases) in ~/.clawdbot/hyperevm/config.json

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export function defaultConfigPath() {
  return process.env.CLAWDBOT_HYPEREVM_CONFIG ||
    path.join(os.homedir(), ".clawdbot", "hyperevm", "config.json");
}

export function normalizeLabel(label) {
  return String(label ?? "").trim().toLowerCase();
}

export function extractEvmAddress(text) {
  const m = String(text ?? "").match(/(?:HL:)?(0x[a-fA-F0-9]{40})/);
  return m ? m[1].toLowerCase() : null;
}

export function assertAddress(addr) {
  const a = extractEvmAddress(addr);
  if (!a) throw new Error("Invalid address. Expected HL:0x... or 0x... (40 hex chars).");
  return a;
}

export async function loadConfig({ configPath = defaultConfigPath() } = {}) {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return normalizeConfig({});
    throw e;
  }
}

export async function saveConfig(cfg, { configPath = defaultConfigPath() } = {}) {
  const normalized = normalizeConfig(cfg);
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
}

export function normalizeConfig(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  if (!c.accounts || typeof c.accounts !== "object") c.accounts = {};
  if (c.defaultAccount != null && typeof c.defaultAccount !== "string") delete c.defaultAccount;
  return c;
}

export async function setAccountAlias({ label, address, makeDefault = false, configPath } = {}) {
  const cfg = await loadConfig({ configPath });
  const key = normalizeLabel(label);
  if (!key) throw new Error("Missing label (example: 'main wallet').");
  cfg.accounts[key] = assertAddress(address);
  if (makeDefault) cfg.defaultAccount = key;
  await saveConfig(cfg, { configPath });
  return cfg;
}

export async function removeAccountAlias({ label, configPath } = {}) {
  const cfg = await loadConfig({ configPath });
  const key = normalizeLabel(label);
  if (!key) throw new Error("Missing label.");
  delete cfg.accounts[key];
  if (cfg.defaultAccount === key) delete cfg.defaultAccount;
  await saveConfig(cfg, { configPath });
  return cfg;
}

export async function setDefaultAccount({ label, configPath } = {}) {
  const cfg = await loadConfig({ configPath });
  const key = normalizeLabel(label);
  if (!key) throw new Error("Missing label.");
  if (!cfg.accounts[key]) throw new Error(`Unknown saved account: ${label}`);
  cfg.defaultAccount = key;
  await saveConfig(cfg, { configPath });
  return cfg;
}

export async function resolveAccountRef(ref, { configPath } = {}) {
  const asAddr = extractEvmAddress(ref);
  if (asAddr) return { address: asAddr, label: null, source: "address" };

  const cfg = await loadConfig({ configPath });
  const key = normalizeLabel(ref);

  if (!key) {
    if (cfg.defaultAccount && cfg.accounts[cfg.defaultAccount]) {
      return { address: cfg.accounts[cfg.defaultAccount], label: cfg.defaultAccount, source: "default" };
    }
    return { address: null, label: null, source: "missing" };
  }

  if (cfg.accounts[key]) return { address: cfg.accounts[key], label: key, source: "alias" };

  return { address: null, label: key, source: "unknown" };
}
