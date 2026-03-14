/**
 * Technical Indicators:
 * - Yellow-Blue Ladder (EMA 26/89)
 * - CD Bottom-fishing (MACD-based with DXDX buy / DBJGXC sell signals)
 * - 4321 multi-timeframe scoring
 */
import type { Candle, Timeframe } from "./marketData";

// ============================================================
// Basic math helpers
// ============================================================
function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  if (data.length === 0) return result;
  result[0] = data[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(data[i]); }
    else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
  }
  return result;
}

function barslast(condition: boolean[], index: number): number {
  for (let i = index; i >= 0; i--) { if (condition[i]) return index - i; }
  return index + 1;
}

function llv(data: number[], index: number, period: number): number {
  let min = data[index];
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) { if (data[i] < min) min = data[i]; }
  return min;
}

function hhv(data: number[], index: number, period: number): number {
  let max = data[index];
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) { if (data[i] > max) max = data[i]; }
  return max;
}

// ============================================================
// RSI (Relative Strength Index)
// ============================================================
export function calculateRSI(candles: Candle[], period = 14): number[] {
  const closes = candles.map(c => c.close);
  const rsi: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change; else avgLoss += Math.abs(change);
  }
  avgGain /= period; avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

// ============================================================
// Bollinger Bands
// ============================================================
export interface BollingerBands {
  upper: number[];
  middle: number[];
  lower: number[];
  bandwidth: number[];
}

export function calculateBollingerBands(candles: Candle[], period = 20, multiplier = 2): BollingerBands {
  const closes = candles.map(c => c.close);
  const middle = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(middle[i]); lower.push(middle[i]); bandwidth.push(0);
    } else {
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - middle[i]) ** 2;
      const std = Math.sqrt(sumSq / period);
      upper.push(middle[i] + multiplier * std);
      lower.push(middle[i] - multiplier * std);
      bandwidth.push(middle[i] > 0 ? (4 * multiplier * std) / middle[i] : 0);
    }
  }
  return { upper, middle, lower, bandwidth };
}

// ============================================================
// ATR (Average True Range)
// ============================================================
export function calculateATR(candles: Candle[], period = 14): number[] {
  const atr: number[] = new Array(candles.length).fill(0);
  if (candles.length < 2) return atr;
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let sum = 0;
  for (let i = 0; i < Math.min(period, tr.length); i++) sum += tr[i];
  atr[Math.min(period - 1, tr.length - 1)] = sum / Math.min(period, tr.length);
  for (let i = period; i < tr.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// ============================================================
// MACD
// ============================================================
export interface MACDResult {
  diff: number[];
  dea: number[];
  macd: number[];
}

export function calculateMACD(candles: Candle[], fast = 12, slow = 26, signal = 9): MACDResult {
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const diff = emaFast.map((v, i) => v - emaSlow[i]);
  const dea = ema(diff, signal);
  const macd = diff.map((v, i) => 2 * (v - dea[i]));
  return { diff, dea, macd };
}

// ============================================================
// Yellow-Blue Ladder
// ============================================================
export interface LadderLevel {
  time: number;
  blueUp: number;
  blueDn: number;
  yellowUp: number;
  yellowDn: number;
  blueMid: number;
  yellowMid: number;
}

export function calculateLadder(candles: Candle[], bluePeriod = 26, yellowPeriod = 89): LadderLevel[] {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  const blueEmaH = ema(highs, bluePeriod);
  const blueEmaL = ema(lows, bluePeriod);
  const blueEmaC = ema(closes, bluePeriod);
  const yellowEmaH = ema(highs, yellowPeriod);
  const yellowEmaL = ema(lows, yellowPeriod);
  const yellowEmaC = ema(closes, yellowPeriod);

  return candles.map((c, i) => ({
    time: c.time,
    blueUp: blueEmaH[i],
    blueDn: blueEmaL[i],
    blueMid: blueEmaC[i],
    yellowUp: yellowEmaH[i],
    yellowDn: yellowEmaL[i],
    yellowMid: yellowEmaC[i],
  }));
}

// ============================================================
// CD Bottom-fishing indicator (Futu NiuNiu style)
// ============================================================
export interface CDSignal {
  time: number;
  type: "buy" | "sell";
  strength: "strong" | "medium" | "weak";
  label: string;
  diffValue?: number;
  deaValue?: number;
  macdValue?: number;
}

export function calculateCDSignals(candles: Candle[]): CDSignal[] {
  if (candles.length < 60) return [];
  const { diff, dea, macd } = calculateMACD(candles);
  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const signals: CDSignal[] = [];

  // Pre-compute conditions
  const goldCross: boolean[] = [];
  const deadCross: boolean[] = [];
  for (let i = 0; i < candles.length; i++) {
    goldCross.push(i > 0 && diff[i] > dea[i] && diff[i - 1] <= dea[i - 1]);
    deadCross.push(i > 0 && diff[i] < dea[i] && diff[i - 1] >= dea[i - 1]);
  }

  for (let i = 30; i < candles.length; i++) {
    // DXDX Buy Signal: MACD golden cross below zero + price near recent low
    if (goldCross[i] && diff[i] < 0) {
      const recentLow = llv(lows, i, 20);
      const priceNearLow = (closes[i] - recentLow) / recentLow < 0.05;
      const prevGoldIdx = barslast(goldCross, i - 1);

      // Check for bottom divergence: price makes new low but MACD doesn't
      let isDivergence = false;
      if (prevGoldIdx < 60 && prevGoldIdx > 2) {
        const prevIdx = i - prevGoldIdx;
        if (lows[i] < lows[prevIdx] && diff[i] > diff[prevIdx]) {
          isDivergence = true;
        }
      }

      if (priceNearLow || isDivergence) {
        signals.push({
          time: candles[i].time,
          type: "buy",
          strength: isDivergence ? "strong" : priceNearLow ? "medium" : "weak",
          label: isDivergence ? "CD底背离买入" : "CD金叉买入",
          diffValue: diff[i], deaValue: dea[i], macdValue: macd[i],
        });
      }
    }

    // DBJGXC Sell Signal: MACD dead cross above zero + price near recent high
    if (deadCross[i] && diff[i] > 0) {
      const recentHigh = hhv(highs, i, 20);
      const priceNearHigh = (recentHigh - closes[i]) / recentHigh < 0.05;
      const prevDeadIdx = barslast(deadCross, i - 1);

      // Check for top divergence: price makes new high but MACD doesn't
      let isDivergence = false;
      if (prevDeadIdx < 60 && prevDeadIdx > 2) {
        const prevIdx = i - prevDeadIdx;
        if (highs[i] > highs[prevIdx] && diff[i] < diff[prevIdx]) {
          isDivergence = true;
        }
      }

      if (priceNearHigh || isDivergence) {
        signals.push({
          time: candles[i].time,
          type: "sell",
          strength: isDivergence ? "strong" : priceNearHigh ? "medium" : "weak",
          label: isDivergence ? "CD顶背离卖出" : "CD死叉卖出",
          diffValue: diff[i], deaValue: dea[i], macdValue: macd[i],
        });
      }
    }
  }

  return signals;
}

// ============================================================
// 4321 Multi-timeframe scoring
// ============================================================
export type TimeframeCandles = Record<string, Candle[]>;

export interface Strategy4321Score {
  symbol: string;
  totalScore: number;
  matchLevel: string;
  cdLevels: string[];
  ladderBreakLevel: string;
  reason: string;
  details: Record<string, number>;
}

function scoreSingleTimeframe(candles: Candle[], label: string): { cdScore: number; ladderScore: number; reason: string } {
  if (candles.length < 60) return { cdScore: 0, ladderScore: 0, reason: `${label}: 数据不足` };

  const { diff, dea, macd } = calculateMACD(candles);
  const ladder = calculateLadder(candles);
  const last = candles.length - 1;
  const close = candles[last].close;

  let cdScore = 0;
  let ladderScore = 0;
  const reasons: string[] = [];

  // CD scoring: golden cross below zero = bullish
  if (diff[last] > dea[last]) {
    cdScore += 10;
    if (diff[last] < 0) { cdScore += 10; reasons.push(`${label}:零下金叉`); }
    else { reasons.push(`${label}:零上金叉`); }
  }
  if (macd[last] > 0 && last > 0 && macd[last - 1] <= 0) {
    cdScore += 5;
    reasons.push(`${label}:MACD翻红`);
  }

  // Ladder scoring: price above blue ladder = bullish
  const lad = ladder[last];
  if (close > lad.blueUp) {
    ladderScore += 15;
    reasons.push(`${label}:站上蓝梯上轨`);
  } else if (close > lad.blueMid) {
    ladderScore += 10;
    reasons.push(`${label}:站上蓝梯中轨`);
  }
  if (close > lad.yellowUp) {
    ladderScore += 10;
    reasons.push(`${label}:站上黄梯上轨`);
  }
  // Blue above yellow = strong trend
  if (lad.blueMid > lad.yellowMid) {
    ladderScore += 5;
    reasons.push(`${label}:蓝梯在黄梯上方`);
  }

  return { cdScore, ladderScore, reason: reasons.join("; ") };
}

export function calculate4321Score(symbol: string, candles: TimeframeCandles, lookbackDays = 5): Strategy4321Score {
  const tfLabels: Record<string, string> = {
    "4h": "4小时", "3h": "3小时", "2h": "2小时", "1h": "1小时", "30m": "30分钟", "1d": "日线",
  };

  const details: Record<string, number> = {};
  const cdLevels: string[] = [];
  let totalScore = 0;
  const reasons: string[] = [];

  for (const [tf, label] of Object.entries(tfLabels)) {
    const tfCandles = candles[tf];
    if (!tfCandles || tfCandles.length < 30) continue;
    const { cdScore, ladderScore, reason } = scoreSingleTimeframe(tfCandles, label);
    const combined = cdScore + ladderScore;
    details[tf] = combined;
    totalScore += combined;
    if (cdScore > 10) cdLevels.push(tf);
    if (reason) reasons.push(reason);
  }

  // Determine match level
  let matchLevel = "1";
  if (cdLevels.length >= 4) matchLevel = "4321";
  else if (cdLevels.length >= 3) matchLevel = "321";
  else if (cdLevels.length >= 2) matchLevel = "21";

  // Check ladder break
  const c30m = candles["30m"];
  let ladderBreakLevel = "none";
  if (c30m && c30m.length > 30) {
    const ladder = calculateLadder(c30m);
    const last = c30m.length - 1;
    const close = c30m[last].close;
    if (close > ladder[last].blueUp && close > ladder[last].yellowUp) ladderBreakLevel = "above_both";
    else if (close > ladder[last].blueUp) ladderBreakLevel = "above_blue";
    else if (close > ladder[last].blueDn) ladderBreakLevel = "in_blue";
  }

  return { symbol, totalScore, matchLevel, cdLevels, ladderBreakLevel, reason: reasons.join(" | "), details };
}

export interface AggressiveScore extends Strategy4321Score {
  aggressiveSignal: boolean;
  aggressiveType: string;
  aggressiveReason: string;
}

export function calculateAggressiveScore(symbol: string, candles: TimeframeCandles, lookbackDays = 5): AggressiveScore {
  const base = calculate4321Score(symbol, candles, lookbackDays);
  let aggressiveSignal = false;
  let aggressiveType = "none";
  let aggressiveReason = "";

  const c30m = candles["30m"];
  if (c30m && c30m.length > 60) {
    const cdSignals = calculateCDSignals(c30m);
    const recentBuy = cdSignals.filter(s => s.type === "buy").slice(-1)[0];
    if (recentBuy) {
      const ladder = calculateLadder(c30m);
      const last = c30m.length - 1;
      const close = c30m[last].close;
      if (close > ladder[last].blueMid) {
        aggressiveSignal = true;
        aggressiveType = recentBuy.strength === "strong" ? "strong_aggressive" : "aggressive";
        aggressiveReason = `${recentBuy.label} + 站上蓝梯`;
      }
    }
  }

  return { ...base, aggressiveSignal, aggressiveType, aggressiveReason };
}
