import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "./mysql.server";

const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
function ts(d: Date = new Date()) { return d.toISOString().slice(0, 19).replace("T", " "); }
function uid() { return crypto.randomUUID(); }

export const getCryptoSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const row = await mysqlOne<{ trc20_address: string; usdt_try_rate: string | number | null; min_amount_usdt: string | number; enabled: number }>(
      "SELECT trc20_address, usdt_try_rate, min_amount_usdt, enabled FROM crypto_settings LIMIT 1",
    );
    if (!row) return { trc20_address: "", usdt_try_rate: null, min_amount_usdt: 5, enabled: false };
    return {
      trc20_address: row.trc20_address,
      usdt_try_rate: row.usdt_try_rate == null ? null : num(row.usdt_try_rate),
      min_amount_usdt: num(row.min_amount_usdt) ?? 5,
      enabled: bool(row.enabled),
    };
  });

const updateSettingsInput = z.object({
  trc20_address: z.string().trim().min(30).max(64),
  usdt_try_rate: z.number().positive().nullable(),
  min_amount_usdt: z.number().positive().max(100000),
  enabled: z.boolean(),
});

export const updateCryptoSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => updateSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz.");
    const row = await mysqlOne<{ id: string }>("SELECT id FROM crypto_settings LIMIT 1");
    if (!row) throw new Error("Ayar bulunamadı");
    await mysqlQuery(
      "UPDATE crypto_settings SET trc20_address=?, usdt_try_rate=?, min_amount_usdt=?, enabled=?, updated_at=? WHERE id=?",
      [data.trc20_address, data.usdt_try_rate, data.min_amount_usdt, data.enabled ? 1 : 0, ts(), row.id],
    );
    return { ok: true };
  });

async function fetchUsdtTryRate(): Promise<number> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=USDTTRY", { headers: { "cache-control": "no-cache" } });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { price?: string };
    const p = Number(j.price);
    if (!Number.isFinite(p) || p <= 0) throw new Error("bad price");
    return p;
  } catch {
    return 40;
  }
}

export const getLiveRate = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const rate = await fetchUsdtTryRate();
    return { rate, source: "binance" as const };
  });

type TronScanResp = {
  hash?: string; confirmed?: boolean; contractRet?: string; timestamp?: number;
  trc20TransferInfo?: Array<{ contract_address?: string; from_address?: string; to_address?: string; amount_str?: string; decimals?: number; symbol?: string }>;
  tokenTransferInfo?: { contract_address?: string; from_address?: string; to_address?: string; amount_str?: string; decimals?: number; symbol?: string };
};

const submitInput = z.object({ txHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/, "Geçersiz tx-hash") });

export const submitCryptoDeposit = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => submitInput.parse(d))
  .handler(async ({ data, context }) => {
    const settings = await mysqlOne<{ trc20_address: string; min_amount_usdt: string | number; enabled: number }>(
      "SELECT trc20_address, min_amount_usdt, enabled FROM crypto_settings LIMIT 1",
    );
    if (!settings || !bool(settings.enabled)) throw new Error("Kripto ödeme şu an kapalı.");
    if (!settings.trc20_address) throw new Error("Yönetici cüzdan adresi ayarlamamış.");

    const dup = await mysqlOne<{ id: string }>("SELECT id FROM crypto_deposits WHERE tx_hash=?", [data.txHash]);
    if (dup) throw new Error("Bu tx-hash zaten kullanılmış.");

    const url = `https://apilist.tronscanapi.com/api/transaction-info?hash=${data.txHash}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`TronScan bağlantısı başarısız (${res.status})`);
    const tx = (await res.json()) as TronScanResp;
    if (!tx || !tx.hash) throw new Error("İşlem TRON ağında bulunamadı.");
    if (tx.confirmed === false) throw new Error("İşlem henüz onaylanmadı, birkaç dakika sonra tekrar deneyin.");
    if (tx.contractRet && tx.contractRet !== "SUCCESS") throw new Error("İşlem başarısız (contractRet != SUCCESS).");

    const transfers = tx.trc20TransferInfo ?? (tx.tokenTransferInfo ? [tx.tokenTransferInfo] : []);
    const transfer = transfers.find(
      (t) => t.contract_address?.toLowerCase() === USDT_TRC20_CONTRACT.toLowerCase() && t.to_address === settings.trc20_address,
    );
    if (!transfer) throw new Error("Bu tx içinde konfigüre edilmiş adrese USDT-TRC20 transferi bulunamadı.");

    const decimals = transfer.decimals ?? 6;
    const raw = transfer.amount_str ?? "0";
    const amountUsdt = Number(raw) / Math.pow(10, decimals);
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) throw new Error("Geçersiz miktar.");
    const min = num(settings.min_amount_usdt) ?? 0;
    if (amountUsdt < min) throw new Error(`Minimum ${min} USDT gerekli, gönderilen: ${amountUsdt}`);

    const rate = await fetchUsdtTryRate();
    const blockTs = tx.timestamp ? ts(new Date(tx.timestamp)) : null;
    const amountTry = Math.round(amountUsdt * rate * 100) / 100;
    const depositId = uid();

    await mysqlQuery(
      `INSERT INTO crypto_deposits (id,user_id,tx_hash,amount_usdt,rate_used,amount_try,from_address,to_address,status,block_timestamp,created_at)
       VALUES (?,?,?,?,?,?,?,?,'confirmed',?,?)`,
      [depositId, context.userId, data.txHash, amountUsdt, rate, amountTry, transfer.from_address ?? null, transfer.to_address ?? settings.trc20_address, blockTs, ts()],
    );
    await mysqlQuery(
      `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE balance_try=balance_try+VALUES(balance_try), updated_at=VALUES(updated_at)`,
      [context.userId, amountTry, ts()],
    );
    const w = await mysqlOne<{ balance_try: string | number | null }>("SELECT balance_try FROM wallets WHERE user_id=?", [context.userId]);
    await mysqlQuery(
      "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), context.userId, "topup", amountTry, num(w?.balance_try) ?? 0, null, `USDT-TRC20 yükleme (${amountUsdt} USDT @ ${rate})`, ts()],
    );
    try {
      await mysqlQuery(
        "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
        [uid(), context.userId, "wallet_topup", "Cüzdan yüklendi", `${amountTry} ₺ (${amountUsdt} USDT) hesabınıza geçti.`, "/hesabim", ts()],
      );
    } catch { /* ignore */ }

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      await notifyTelegram(
        ["🪙 <b>USDT-TRC20 YÜKLEME</b>", `Tutar: <b>${amountUsdt} USDT</b> (${amountTry} TL @ ${rate})`, `Tx: <code>${data.txHash}</code>`].join("\n"),
      );
    } catch (e) {
      console.error("[notify] crypto", (e as Error).message);
    }

    return { ok: true, depositId, amountUsdt, amountTry, rate };
  });

type CryptoDepositRow = {
  id: string;
  user_id?: string | null;
  tx_hash: string | null;
  amount_usdt: number | string | null;
  amount_try: number | string | null;
  rate_used: number | string | null;
  status: string | null;
  from_address?: string | null;
  to_address?: string | null;
  created_at: string | null;
  block_timestamp?: string | null;
};

export const listMyCryptoDeposits = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<CryptoDepositRow[]> => {
    const rows = await mysqlQuery<CryptoDepositRow>(
      "SELECT id, tx_hash, amount_usdt, amount_try, rate_used, status, created_at, block_timestamp FROM crypto_deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
      [context.userId],
    );
    return rows;
  });

export const adminListCryptoDeposits = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<CryptoDepositRow[]> => {
    if (!context.isAdmin) throw new Error("Yetkisiz.");
    const rows = await mysqlQuery<CryptoDepositRow>(
      "SELECT id, user_id, tx_hash, amount_usdt, amount_try, rate_used, status, from_address, to_address, created_at FROM crypto_deposits ORDER BY created_at DESC LIMIT 100",
    );
    return rows;
  });
