#!/usr/bin/env node
// Command + NL interface for HyperEVM live execution.

import {
  DEFAULT_CHAIN_ID,
  DEFAULT_RPC_URL,
  assertAddress,
  rpcChainId,
  rpcSendRawTransaction,
  preflightNativeTransfer,
  castVersion,
  castWalletAddressFromPrivateKey,
  sendNativeWithCast,
  waitForReceipt,
  receiptStatus,
  formatUnits,
  txLink,
} from "./hyperevm_execute_api.mjs";

import {
  resolveAccountRef,
  extractEvmAddress,
} from "../../trace-hyperevm-wallet/scripts/hyperevm_scan_config.mjs";

function stripPrefix(raw) {
  const t = raw.trim();
  const lower = t.toLowerCase();
  const prefixes = ["/hexec", "hexec", "/hypex", "hypex"];
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

function extractAddress(text) {
  return extractEvmAddress(text);
}

function extractFromToByKeywords(text) {
  const raw = String(text ?? "");
  const fromMatch = raw.match(/\bfrom\s+(?:HL:)?(0x[a-fA-F0-9]{40})\b/i);
  const toMatch = raw.match(/\bto\s+(?:HL:)?(0x[a-fA-F0-9]{40})\b/i);
  if (!fromMatch && !toMatch) return null;
  return {
    fromRef: fromMatch ? fromMatch[1] : "",
    toAddress: toMatch ? toMatch[1] : "",
  };
}

function splitFromToRef(parts) {
  const tail = parts.filter(Boolean);
  const addrIdx = [];
  for (let i = 0; i < tail.length; i++) {
    if (extractAddress(tail[i])) addrIdx.push(i);
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

function guessIntentFromNL(text) {
  const t = String(text ?? "").toLowerCase();
  if (t.includes("health") || t.includes("cast") || t.includes("rpc")) return { cmd: "health" };
  if (t.includes("broadcast raw")) return { cmd: "broadcast-raw" };
  if (/\b(send|transfer|execute|broadcast)\b/.test(t)) return { cmd: "send-native" };
  return { cmd: "help" };
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

function usage() {
  return [
    'Usage: hexec "<command>"',
    "Commands:",
    "  health",
    "  send-native <from|label> <to> --amount <decimal> [--pk-env ENV] [--broadcast --yes SEND] [--legacy] [--no-wait]",
    "  broadcast-raw <0xSignedTransaction> --yes SEND [--no-wait]",
    "",
    "Safety model:",
    "  - dry-run by default (no broadcast)",
    "  - live send requires both: --broadcast and --yes SEND",
    "  - addresses and tx hashes are printed in full (no truncation)",
    "  - private key is read only from env var (default: HYPEREVM_EXEC_PRIVATE_KEY)",
  ].join("\n");
}

async function cmdHealth() {
  const [chain, cast] = await Promise.all([
    rpcChainId().catch((e) => ({ error: e.message })),
    castVersion().catch((e) => ({ error: e.message })),
  ]);

  const lines = [];
  lines.push("HyperEVM execution health");
  lines.push(`- expected chain id: ${DEFAULT_CHAIN_ID}`);
  lines.push(`- rpc url: ${DEFAULT_RPC_URL}`);

  if (chain?.error) {
    lines.push(`- rpc chain id: ERROR (${chain.error})`);
  } else {
    lines.push(`- rpc chain id: ${chain.decimal} (${chain.hex})${String(chain.decimal) === String(DEFAULT_CHAIN_ID) ? "" : " [MISMATCH]"}`);
  }

  if (cast?.error) {
    lines.push(`- cast: ERROR (${cast.error})`);
  } else {
    lines.push(`- cast: ${cast}`);
  }

  return lines.join("\n");
}

async function cmdSendNative({
  fromRef,
  toAddress,
  amount,
  pkEnv = "HYPEREVM_EXEC_PRIVATE_KEY",
  broadcast = false,
  yesToken = "",
  legacy = false,
  wait = true,
} = {}) {
  if (amount == null) throw new Error("Usage: hexec send-native <from> <to> --amount 0.01");

  const fromAddress = await resolveAddressInput(fromRef || "");
  const to = assertAddress(toAddress);

  const pre = await preflightNativeTransfer({
    from: fromAddress,
    to,
    amountDecimal: amount,
    rpcUrl: DEFAULT_RPC_URL,
  });
  if (pre.valueWei <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  const lines = [];
  lines.push("HyperEVM live execution: native transfer");
  lines.push(`- from: ${pre.fromAddress}`);
  lines.push(`- to: ${pre.toAddress}`);
  lines.push(`- amount: ${amount} HYPE (${pre.valueWei.toString()} wei)`);
  lines.push(`- chain id: ${pre.chainIdDecimal} (${pre.chainIdHex})${String(pre.chainIdDecimal) === String(DEFAULT_CHAIN_ID) ? "" : " [MISMATCH]"}`);
  lines.push(`- nonce(pending): ${pre.nonce}`);
  lines.push(`- gas limit(est): ${pre.gasLimit.toString()}`);
  lines.push(`- gas price: ${formatUnits(pre.gasPriceWei.toString(), 9, { precision: 3 })} gwei`);
  lines.push(`- est fee: ${formatUnits(pre.estimatedFeeWei.toString(), 18, { precision: 8 })} HYPE`);
  lines.push(`- wallet balance: ${formatUnits(pre.balanceWei.toString(), 18, { precision: 8 })} HYPE`);
  lines.push(`- funds check: ${pre.enoughFunds ? "ok" : "INSUFFICIENT for amount+fee"}`);

  if (!broadcast) {
    lines.push("- mode: dry-run (no signing, no broadcast)");
    lines.push("- next step: add --broadcast --yes SEND --pk-env <ENV_VAR>");
    lines.push(`- pk env (expected): ${pkEnv}`);
    return lines.join("\n");
  }

  if (String(yesToken) !== "SEND") {
    throw new Error('Broadcast blocked. Re-run with explicit confirmation: --broadcast --yes SEND');
  }
  if (!pre.enoughFunds) {
    throw new Error("Broadcast blocked due to insufficient funds for amount + estimated fee.");
  }
  if (String(pre.chainIdDecimal) !== String(DEFAULT_CHAIN_ID)) {
    throw new Error(`Broadcast blocked due to chain mismatch. Expected ${DEFAULT_CHAIN_ID}, got ${pre.chainIdDecimal}.`);
  }

  const privateKey = String(process.env[pkEnv] || "").trim();
  if (!privateKey) {
    throw new Error(`Missing private key env var: ${pkEnv}`);
  }

  const signerAddress = await castWalletAddressFromPrivateKey(privateKey);
  if (signerAddress !== pre.fromAddress) {
    throw new Error(`Signer mismatch: private key resolves to ${signerAddress}, but from=${pre.fromAddress}`);
  }

  lines.push(`- signer: ${signerAddress} (matches from)`);
  lines.push("- broadcasting: yes");

  const sent = await sendNativeWithCast({
    to: pre.toAddress,
    amountDecimal: amount,
    rpcUrl: DEFAULT_RPC_URL,
    chainId: DEFAULT_CHAIN_ID,
    privateKey,
    nonce: pre.nonce,
    gasLimit: pre.gasLimit.toString(),
    gasPriceWei: pre.gasPriceWei.toString(),
    legacy,
  });

  if (!sent.hash) {
    throw new Error(`Broadcast returned no tx hash. Raw output: ${(sent.stdout || "").slice(0, 300)}`);
  }

  lines.push(`- tx hash: ${sent.hash}`);
  lines.push(`- tx link: ${txLink(sent.hash)}`);

  if (wait) {
    const receipt = await waitForReceipt(sent.hash, { rpcUrl: DEFAULT_RPC_URL });
    const ok = receiptStatus(receipt);
    lines.push(`- receipt status: ${ok == null ? "n/a" : ok ? "success" : "revert"}`);
    if (receipt?.gasUsed) lines.push(`- gas used: ${Number.parseInt(receipt.gasUsed, 16)}`);
  } else {
    lines.push("- receipt wait: skipped (--no-wait)");
  }

  return lines.join("\n");
}

async function cmdBroadcastRaw({ signedTx, yesToken = "", wait = true } = {}) {
  const raw = String(signedTx || "").trim();
  if (!raw) throw new Error("Usage: hexec broadcast-raw <0xSignedTransaction> --yes SEND");
  if (String(yesToken) !== "SEND") {
    throw new Error('Broadcast blocked. Re-run with explicit confirmation: --yes SEND');
  }

  const txHash = await rpcSendRawTransaction(raw, { rpcUrl: DEFAULT_RPC_URL });
  const lines = [];
  lines.push("HyperEVM raw broadcast");
  lines.push(`- tx hash: ${txHash}`);
  lines.push(`- tx link: ${txLink(txHash)}`);

  if (wait) {
    const receipt = await waitForReceipt(txHash, { rpcUrl: DEFAULT_RPC_URL });
    const ok = receiptStatus(receipt);
    lines.push(`- receipt status: ${ok == null ? "n/a" : ok ? "success" : "revert"}`);
    if (receipt?.gasUsed) lines.push(`- gas used: ${Number.parseInt(receipt.gasUsed, 16)}`);
  } else {
    lines.push("- receipt wait: skipped (--no-wait)");
  }

  return lines.join("\n");
}

async function runDeterministic(pref) {
  const tokens = tokenize(pref);
  const args = parseArgs(tokens);
  const cmd = String(args._[0] ?? "health").toLowerCase();

  if (cmd === "help" || cmd === "usage") return usage();
  if (cmd === "health") return cmdHealth();

  if (cmd === "send-native" || cmd === "send") {
    const { fromRef, toAddress } = splitFromToRef(args._.slice(1));
    return cmdSendNative({
      fromRef,
      toAddress,
      amount: args.amount,
      pkEnv: args["pk-env"] || "HYPEREVM_EXEC_PRIVATE_KEY",
      broadcast: Boolean(args.broadcast),
      yesToken: args.yes || "",
      legacy: Boolean(args.legacy),
      wait: !Boolean(args["no-wait"]),
    });
  }

  if (cmd === "broadcast-raw") {
    return cmdBroadcastRaw({
      signedTx: args._[1],
      yesToken: args.yes || "",
      wait: !Boolean(args["no-wait"]),
    });
  }

  throw new Error(`Unknown command: ${cmd}`);
}

async function runNL(raw) {
  const { cmd } = guessIntentFromNL(raw);
  if (cmd === "health") return cmdHealth();
  if (cmd === "broadcast-raw") {
    throw new Error("For safety, use deterministic command mode: hexec broadcast-raw <0xSignedTransaction> --yes SEND");
  }
  if (cmd === "send-native") {
    const directional = extractFromToByKeywords(raw);
    const addrs = [...raw.matchAll(/(?:HL:)?(0x[a-fA-F0-9]{40})/g)].map((m) => m[1]);
    const amountMatch =
      raw.match(/(?:amount|send|transfer|value)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i) ||
      raw.match(/\b(\d+(?:\.\d+)?)\s*(?:hype|eth)\b/i);
    const amount = amountMatch ? amountMatch[1] : null;

    const fromRef = directional?.fromRef || (addrs.length >= 2 ? addrs[0] : "");
    const toAddress = directional?.toAddress || (addrs.length >= 2 ? addrs[1] : addrs[0] || "");
    if (!fromRef || !toAddress || !amount) {
      throw new Error("Ambiguous NL send request. Use deterministic command: hexec send-native <from> <to> --amount <decimal>");
    }
    return cmdSendNative({
      fromRef,
      toAddress,
      amount,
      broadcast: false,
      wait: true,
    });
  }
  return usage();
}

async function main() {
  const raw = process.argv.slice(2).join(" ").trim();
  if (!raw) {
    console.log(usage());
    process.exit(0);
  }

  const pref = stripPrefix(raw);
  const out = pref != null ? await runDeterministic(pref) : await runNL(raw);
  console.log(out);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
