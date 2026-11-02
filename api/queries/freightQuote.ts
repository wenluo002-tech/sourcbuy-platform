/**
 * 真实渠道报价引擎（价格矩阵 2026-10-15 生效，CNY 计费）
 * 规则全部来自用户提供的配置文档；文档字面歧义处按"整票最低计费重"实现并在 note 标注。
 */
import {
  REAL_CHANNELS,
  US_AIR_PRICES,
  UPS_SCS_PRICES,
  US_SEA_PRICES,
  US_SEA_REBATE,
  MX_AIR_PRICES,
  CA_SEA_PRICES,
  AU_SEA_PRICES,
  US_SEA_CARGO_SURCHARGE,
  MANUAL_QUOTE_CARGO,
  usAirZone,
  usSeaZone,
  usUpsScsStateSurcharge,
  auZone,
  findRealChannel,
  type RealChannelDef,
  type WeightBreak,
} from "../../contracts/freightRates";

export interface FreightQuoteInput {
  channelId: string;
  destinationCode: string;
  zip?: string;
  caRegion?: string;
  cargoType?: string;
  residential?: boolean;
  quantity: number;
  weightKg: number; // 单件实重
  dimCm?: { l: number; w: number; h: number };
}

export interface SurchargeLine {
  label: string;
  amountCny: number;
}

export interface FreightQuote {
  ok: boolean;
  error?: string; // 不可报价原因（如未达起运量、缺邮编）
  manualOnly?: boolean; // 须人工单询
  channelId: string;
  channelName: string;
  mode: "air" | "sea";
  ddp: boolean;
  transitNote: string;
  chargeableKg: number;
  pricePerKgCny: number | null;
  freightCny: number;
  surcharges: SurchargeLine[];
  totalCny: number;
  basisNote: string; // 计费口径
  warnings: string[];
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function roundUpTo(kg: number, step: 0.5 | 1 | null): number {
  if (!step) return kg;
  return Math.ceil(kg / step) * step;
}

function pickBreak(breaks: WeightBreak[], kg: number): WeightBreak | null {
  // 表按 minKg 降序存储，取第一个满足的档
  return breaks.find((b) => kg >= b.minKg) ?? null;
}

export function quoteFreight(input: FreightQuoteInput): FreightQuote {
  const ch = findRealChannel(input.channelId);
  const fail = (error: string): FreightQuote => ({
    ok: false, error, channelId: input.channelId, channelName: ch?.name ?? input.channelId,
    mode: ch?.mode ?? "air", ddp: ch?.ddp ?? false, transitNote: ch?.transitNote ?? "",
    chargeableKg: 0, pricePerKgCny: null, freightCny: 0, surcharges: [], totalCny: 0,
    basisNote: "", warnings: [],
  });
  if (!ch) return fail("未知渠道");
  if (!ch.country.includes(input.destinationCode)) return fail("该渠道不到此目的地");

  const cargoType = input.cargoType ?? "general";
  const warnings: string[] = [];
  const surcharges: SurchargeLine[] = [];

  // ---- 人工单询货物 ----
  if (MANUAL_QUOTE_CARGO[cargoType]) {
    const q = fail(MANUAL_QUOTE_CARGO[cargoType]);
    q.manualOnly = true;
    return q;
  }
  // ---- 黑名单：普货渠道拒收带电 ----
  if (cargoType === "battery" && !input.channelId.includes("battery")) {
    const q = fail("普货渠道拒收带电产品（冲货罚款 2000 元起），请改选内电渠道");
    q.manualOnly = false;
    return q;
  }

  // ---- 计费重 ----
  const actualTotal = input.weightKg * input.quantity;
  const hasDims =
    !!input.dimCm && input.dimCm.l > 0 && input.dimCm.w > 0 && input.dimCm.h > 0;
  const volTotal = hasDims
    ? ((input.dimCm!.l * input.dimCm!.w * input.dimCm!.h) / ch.divisor) * input.quantity
    : null;
  let chargeable =
    ch.splitHalf && volTotal != null
      ? (actualTotal + volTotal) / 2 // 分抛 50%
      : Math.max(actualTotal, volTotal ?? 0); // 不分抛取大；无尺寸按实重
  chargeable = roundUpTo(chargeable, ch.rounding);
  if (chargeable < ch.minShipmentKg) chargeable = ch.minShipmentKg;

  const basisNote =
    volTotal == null
      ? `按实重 ${r2(actualTotal)}kg（未填尺寸）${ch.minShipmentKg ? `，整票最低 ${ch.minShipmentKg}kg` : ""}`
      : ch.splitHalf
        ? `分抛50%：(${r2(actualTotal)} 实重 + ${r2(volTotal)} 材积) / 2 = ${r2(chargeable)}kg${ch.rounding ? `，${ch.rounding}kg 进位` : ""}`
        : `不分抛取大：实重 ${r2(actualTotal)} / 材积 ${r2(volTotal)} → ${r2(chargeable)}kg${ch.rounding ? `，${ch.rounding}kg 进位` : ""}`;

  // ---- 单价（分渠道取价）----
  let pricePerKg: number | null = null;
  let auFlat: number | null = null; // 澳洲 0-10kg 首续重一口价
  const id = ch.id;

  if (US_AIR_PRICES[id]) {
    const zone = input.zip ? usAirZone(input.zip) : null;
    if (!zone) return fail("美国空派按邮编分区报价，请填 5 位美国邮编");
    pricePerKg = pickBreak(US_AIR_PRICES[id], chargeable)?.prices[zone] ?? null;
  } else if (id === "ups_scs") {
    if (chargeable < 150) return fail("UPS-SCS 150kg 起运，这票不够量，看空派或海派");
    pricePerKg =
      pickBreak(UPS_SCS_PRICES[input.destinationCode === "CA" ? "ca" : "us"], chargeable)
        ?.prices.any ?? null;
    if (input.destinationCode === "US" && input.zip && usUpsScsStateSurcharge(input.zip)) {
      surcharges.push({ label: "AR/TX/FL 邮编附加费（+¥4/kg）", amountCny: r2(4 * chargeable) });
    }
  } else if (US_SEA_PRICES[id]) {
    const zone = input.zip ? usSeaZone(input.zip) : null;
    if (!zone) return fail("美国海派按邮编分区报价，请填 5 位美国邮编");
    const base = pickBreak(US_SEA_PRICES[id], chargeable)?.prices[zone] ?? null;
    if (base != null) {
      pricePerKg = base;
      // 重货减价：比重=实重kg/材积CBM，计费重 ≥100kg 才享受
      if (chargeable >= 100 && volTotal != null && actualTotal > 0) {
        const volCbm = (volTotal * ch.divisor) / 1e6;
        const ratio = volCbm > 0 ? actualTotal / volCbm : 0;
        const tier = US_SEA_REBATE.find((t) => ratio >= t.minRatio);
        if (tier) {
          // 减价以独立负值行列示（对买家透明），单价保持价卡原价
          surcharges.push({
            label: `重货优惠（比重 1:${tier.minRatio} 档，-¥${tier.off}/kg）`,
            amountCny: r2(-tier.off * chargeable),
          });
        }
      }
    }
    // 品类附加费
    const cargoFee = US_SEA_CARGO_SURCHARGE[cargoType];
    if (cargoFee) {
      surcharges.push({ label: `品类附加费（+¥${cargoFee}/kg）`, amountCny: r2(cargoFee * chargeable) });
    }
  } else if (MX_AIR_PRICES[id]) {
    if (chargeable < 21) return fail("墨西哥空派 21kg 起运");
    pricePerKg = pickBreak(MX_AIR_PRICES[id], chargeable)?.prices.any ?? null;
    if (cargoType === "audio") {
      surcharges.push({
        label: chargeable <= 100 ? "音频类产品附加费（≤100kg）" : "音频类产品附加费（>100kg）",
        amountCny: chargeable <= 100 ? 100 : 350,
      });
    }
  } else if (CA_SEA_PRICES[id]) {
    const region = input.caRegion;
    if (!region || !CA_SEA_PRICES[id][region]) return fail("加拿大海运请选择派送区域");
    if (chargeable < 21) return fail("加拿大海运 21kg 起运");
    pricePerKg = pickBreak(CA_SEA_PRICES[id][region], chargeable)?.prices.any ?? null;
    if (input.residential && region === "多伦多") {
      surcharges.push({ label: "多伦多私人地址附加费（+¥2/kg）", amountCny: r2(2 * chargeable) });
    }
    if (region === "温哥华" && cargoType !== "general") {
      warnings.push("温哥华路线拒接按摩类产品，货属此类请换渠道");
    }
  } else if (id === "au_sea") {
    const zone = input.zip ? auZone(input.zip) : null;
    if (!zone) return fail("澳洲海派按邮编分区报价，请填 4 位澳洲邮编");
    const z = AU_SEA_PRICES[zone];
    if (chargeable <= 10) {
      auFlat = r2(z.firstKg + z.addKg * Math.max(0, chargeable - 1));
    } else {
      pricePerKg = pickBreak(z.tiers, chargeable)?.prices.any ?? null;
    }
    if (cargoType === "epidemic") surcharges.push({ label: "防疫物资附加费（+¥3/kg）", amountCny: r2(3 * chargeable) });
    if (cargoType === "wood") surcharges.push({ label: "木质产品附加费（+¥2/kg）", amountCny: r2(2 * chargeable) });
  }
  if (pricePerKg == null && auFlat == null) return fail("该重量段暂无价格，转人工询价");

  const freightCny = auFlat ?? r2(pricePerKg! * chargeable);

  // ---- 通用附加费 ----
  if (ch.zhuhaiWarehouse) {
    surcharges.push({ label: "珠海仓交仓内陆费（+¥0.5/kg）", amountCny: r2(0.5 * chargeable) });
  }
  if (ch.customsFeeCny) {
    surcharges.push({ label: `报关费（¥${ch.customsFeeCny}/票）`, amountCny: ch.customsFeeCny });
  }
  if (input.residential && id.startsWith("us_air")) {
    warnings.push("美国空派私宅费 ¥25/箱，按实际箱数另计（私人地址限 2 个品名）");
  }
  if (input.residential && id === "ups_scs") {
    warnings.push("UPS-SCS 私宅费 $260/票（另加燃油），偏远 +¥4/kg、超偏远 +¥8/kg，以地址核验为准");
  }

  // ---- UPS 超长超重规则（美国空派/UPS-SCS）----
  if ((id.startsWith("us_air") || id === "ups_scs") && hasDims) {
    const girth = input.dimCm!.l + 2 * (input.dimCm!.w + input.dimCm!.h);
    const perPieceChargeable = ch.splitHalf
      ? (input.weightKg + (volTotal! / input.quantity)) / 2
      : Math.max(input.weightKg, volTotal! / input.quantity);
    if (id === "ups_scs" && (perPieceChargeable > 68 || girth > 330)) {
      const q = fail("单件计费重超 68kg 或周长超 330cm，UPS-SCS 需转人工单询");
      q.manualOnly = true;
      return q;
    }
    if (input.weightKg >= 22.4 && input.weightKg <= 68) {
      warnings.push("单件实重 22.4–68kg：UPS 超重附加费 ¥260/箱，按实际箱数另计");
    }
    if (girth >= 260 && girth < 320) warnings.push(`周长 ${girth.toFixed(0)}cm ≥260：UPS 附加费 ¥260/箱，按实际箱数另计`);
    if (girth >= 320 && girth < 419) warnings.push(`周长 ${girth.toFixed(0)}cm ≥320cm：UPS 附加费 ¥520/箱，按实际箱数另计`);
  }

  // ---- 包装与合规警示 ----
  if (input.destinationCode === "US" || input.destinationCode === "MX") {
    warnings.push("外箱必须有 MADE IN CHINA 字样");
  }
  if (input.destinationCode === "MX") {
    warnings.push("墨西哥拒收未装瓦楞纸箱的裸装货；单箱不能超 30kg");
  }

  const totalCny = r2(freightCny + surcharges.reduce((s, x) => s + x.amountCny, 0));
  return {
    ok: true,
    channelId: ch.id,
    channelName: ch.name,
    mode: ch.mode,
    ddp: ch.ddp,
    transitNote: ch.transitNote,
    chargeableKg: r2(chargeable),
    pricePerKgCny: pricePerKg != null ? r2(pricePerKg) : null,
    freightCny,
    surcharges,
    totalCny,
    basisNote,
    warnings,
  };
}

export { REAL_CHANNELS };
export type { RealChannelDef };
