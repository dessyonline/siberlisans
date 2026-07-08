import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// USDT-TRC20 contract (Tron mainnet)
const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// ------- Settings ---------
export const getCryptoSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("crypto_settings")
      .select("trc20_address, usdt_try_rate, min_amount_usdt, enabled")
      .limit(1)
      .maybeSingle();
    return data ?? { trc20_address: "", usdt_try_rate: null, min_amount_usdt: 5, enabled: false };
  });

const updateSettingsInput = z.object({
  trc20_address: z.string().trim().min(30).max(64),
  usdt_try_rate: z.number().positive().nullable(),
  min_amount_usdt: z.number().positive().max(100000),
  enabled: z.boolean(),
});

export const updateCryptoSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { data: row } = await supabase.from("crypto_settings").select("id").limit(1).maybeSingle();
    if (!row) throw new Error("Ayar bulunamadı");
    const { error } = await supabase
      .from("crypto_settings")
      .update({
        trc20_address: data.trc20_address,
        usdt_try_rate: data.usdt_try_rate,
        min_amount_usdt: data.min_amount_usdt,
        enabled: data.enabled,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------- Live rate helper ---------
async function fetchUsdtTryRate(): Promise<number> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=USDTTRY", {
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { price?: string };
    const p = Number(j.price);
    if (!Number.isFinite(p) || p <= 0) throw new Error("bad price");
    return p;
  } catch {
    // fallback
    return 40;
  }
}

export const getLiveRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Her zaman canlı Binance kuru; admin override kaldırıldı
    const rate = await fetchUsdtTryRate();
    return { rate, source: "binance" as const };
  });


// ------- Submit deposit (verify via TronScan) ---------
const submitInput = z.object({
  txHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/, "Geçersiz tx-hash"),
});

type TronScanResp = {
  hash?: string;
  confirmed?: boolean;
  contractRet?: string;
  timestamp?: number;
  trc20TransferInfo?: Array<{
    contract_address?: string;
    from_address?: string;
    to_address?: string;
    amount_str?: string;
    decimals?: number;
    symbol?: string;
  }>;
  tokenTransferInfo?: {
    contract_address?: string;
    from_address?: string;
    to_address?: string;
    amount_str?: string;
    decimals?: number;
    symbol?: string;
  };
};

export const submitCryptoDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Settings
    const { data: settings } = await supabase
      .from("crypto_settings")
      .select("trc20_address, usdt_try_rate, min_amount_usdt, enabled")
      .limit(1)
      .maybeSingle();
    if (!settings || !settings.enabled) throw new Error("Kripto ödeme şu an kapalı.");
    if (!settings.trc20_address) throw new Error("Yönetici cüzdan adresi ayarlamamış.");

    // Duplicate check
    const { data: dup } = await supabase
      .from("crypto_deposits")
      .select("id")
      .eq("tx_hash", data.txHash)
      .maybeSingle();
    if (dup) throw new Error("Bu tx-hash zaten kullanılmış.");

    // TronScan lookup
    const url = `https://apilist.tronscanapi.com/api/transaction-info?hash=${data.txHash}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`TronScan bağlantısı başarısız (${res.status})`);
    const tx = (await res.json()) as TronScanResp;
    if (!tx || !tx.hash) throw new Error("İşlem TRON ağında bulunamadı.");
    if (tx.confirmed === false) throw new Error("İşlem henüz onaylanmadı, birkaç dakika sonra tekrar deneyin.");
    if (tx.contractRet && tx.contractRet !== "SUCCESS") throw new Error("İşlem başarısız (contractRet != SUCCESS).");

    // Find USDT-TRC20 transfer
    const transfers = tx.trc20TransferInfo ?? (tx.tokenTransferInfo ? [tx.tokenTransferInfo] : []);
    const transfer = transfers.find(
      (t) =>
        t.contract_address?.toLowerCase() === USDT_TRC20_CONTRACT.toLowerCase() &&
        t.to_address === settings.trc20_address,
    );
    if (!transfer) {
      throw new Error("Bu tx içinde konfigüre edilmiş adrese USDT-TRC20 transferi bulunamadı.");
    }

    const decimals = transfer.decimals ?? 6;
    const raw = transfer.amount_str ?? "0";
    const amountUsdt = Number(raw) / Math.pow(10, decimals);
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) throw new Error("Geçersiz miktar.");
    const min = Number(settings.min_amount_usdt ?? 0);
    if (amountUsdt < min) throw new Error(`Minimum ${min} USDT gerekli, gönderilen: ${amountUsdt}`);

    // Rate
    const rate =
      settings.usdt_try_rate && Number(settings.usdt_try_rate) > 0
        ? Number(settings.usdt_try_rate)
        : await fetchUsdtTryRate();

    const blockTs = tx.timestamp ? new Date(tx.timestamp).toISOString() : null;

    // Credit via admin client + SECURITY DEFINER RPC
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: depositId, error } = await supabaseAdmin.rpc("credit_crypto_deposit" as never, {
      _user_id: userId,
      _tx_hash: data.txHash,
      _amount_usdt: amountUsdt,
      _rate: rate,
      _from_address: transfer.from_address ?? null,
      _to_address: transfer.to_address ?? settings.trc20_address,
      _block_timestamp: blockTs,
    } as never);
    if (error) throw new Error(error.message);

    const amountTry = Math.round(amountUsdt * rate * 100) / 100;

    // Notify admin telegram
    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      await notifyTelegram(
        [
          "🪙 <b>USDT-TRC20 YÜKLEME</b>",
          `Tutar: <b>${amountUsdt} USDT</b> (${amountTry} TL @ ${rate})`,
          `Tx: <code>${data.txHash}</code>`,
        ].join("\n"),
      );
    } catch (e) {
      console.error("[notify] crypto", (e as Error).message);
    }

    return { ok: true, depositId, amountUsdt, amountTry, rate };
  });

// ------- Listings ---------
export const listMyCryptoDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("crypto_deposits")
      .select("id, tx_hash, amount_usdt, amount_try, rate_used, status, created_at, block_timestamp")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const adminListCryptoDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { data } = await supabase
      .from("crypto_deposits")
      .select("id, user_id, tx_hash, amount_usdt, amount_try, rate_used, status, from_address, to_address, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });
