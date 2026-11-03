/**
 * 汇率约定（冻结决策：多币种按结汇汇率减 0.3）
 *
 * 买家付美元，我们付工厂人民币。美元→人民币按「结汇汇率」折算：
 *   结汇汇率 = 当日牌价 − 0.3
 * 0.3 的价差覆盖结汇成本与汇兑波动，是服务经济性的一部分，不是隐藏费用——
 * 牌价与扣减都在这里显式可见，改数字只改这一个文件。
 *
 * 更新方式：牌价每日变动，目前手动维护（更新 FX_MARKET_USDCNY 即可）。
 * 待办：接中国银行/央行中间价每日自动同步，并记录牌价日期。
 */

/** 当日美元兑人民币牌价（2026-11-03 中国银行 USD/CNY，由业务方确认 6.64） */
export const FX_MARKET_USDCNY = 6.64;
export const FX_MARKET_DATE = "2026-11-03";

/** 约定扣减点数 */
export const FX_SPREAD = 0.3;

/** 系统结算汇率：所有 CNY→USD 折算统一用它 */
export const FX_SETTLEMENT = 6.34; // = FX_MARKET_USDCNY - FX_SPREAD

/** UI 展示文案 */
export const FX_LABEL = `结汇汇率 ${FX_SETTLEMENT}（当日牌价 ${FX_MARKET_USDCNY} − ${FX_SPREAD}）`;
