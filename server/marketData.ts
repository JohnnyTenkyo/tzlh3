/**
 * Market Data v3 - Multi-source K-line data with failover
 * Sources: Alpaca, Stooq, Yahoo Finance, Tiingo, Finnhub, AlphaVantage,
 *          Polygon.io (free), Twelve Data (free), MarketStack (free)
 * Features: batch requests, rate limiting, health monitoring
 */
import axios from "axios";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { dataSourceHealth } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface Candle {
  time: number; // ms timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "15m" | "30m" | "1h" | "2h" | "3h" | "4h" | "1d" | "1w";
export type DataSource = "alpaca" | "stooq" | "yahoo" | "tiingo" | "finnhub" | "alphavantage" | "polygon" | "twelvedata" | "marketstack";

export const BASE_TIMEFRAMES = ["15m", "1h", "1d"];
export const AGGREGATED_TIMEFRAMES: Record<string, { base: string; factor: number; mode: string }> = {
  "30m": { base: "15m", factor: 2, mode: "factor" },
  "2h": { base: "1h", factor: 2, mode: "factor" },
  "3h": { base: "1h", factor: 3, mode: "factor" },
  "4h": { base: "1h", factor: 4, mode: "factor" },
  "1w": { base: "1d", factor: 5, mode: "week" },
};

// ============================================================
// Aggregation helpers
// ============================================================
function aggregateByFactor(candles: Candle[], factor: number): Candle[] {
  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const group = candles.slice(i, i + factor);
    if (group.length === 0) continue;
    result.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

function aggregateToWeekly(candles: Candle[]): Candle[] {
  const weeks = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = new Date(c.time);
    const dayOfWeek = d.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setUTCDate(monday.getUTCDate() + mondayOffset);
    const key = monday.toISOString().split("T")[0];
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(c);
  }
  return Array.from(weeks.entries()).map(([, group]) => ({
    time: group[0].time,
    open: group[0].open,
    high: Math.max(...group.map(c => c.high)),
    low: Math.min(...group.map(c => c.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((s, c) => s + c.volume, 0),
  })).sort((a, b) => a.time - b.time);
}

// ============================================================
// Data source implementations
// ============================================================

// --- Alpaca (primary for all timeframes) ---
async function fetchAlpacaCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const apiKey = ENV.alpacaApiKey;
  const secretKey = ENV.alpacaSecretKey;
  if (!apiKey || !secretKey) throw new Error("ALPACA keys not set");
  if (!BASE_TIMEFRAMES.includes(timeframe)) throw new Error(`Alpaca: unsupported ${timeframe}`);

  const tfMap: Record<string, string> = { "15m": "15Min", "1h": "1Hour", "1d": "1Day" };
  const alpacaTf = tfMap[timeframe];
  if (!alpacaTf) throw new Error(`Alpaca unsupported: ${timeframe}`);

  const now = new Date();
  const defaultEnd = endDate || now.toISOString().split("T")[0];
  const defaultStart = startDate || (() => {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - (timeframe === "1d" ? 10 : 5));
    return d.toISOString().split("T")[0];
  })();

  const headers = { "APCA-API-KEY-ID": apiKey, "APCA-API-SECRET-KEY": secretKey };
  const allCandles: Candle[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;

  do {
    const params: Record<string, any> = {
      symbols: symbol, timeframe: alpacaTf, start: defaultStart, end: defaultEnd, limit: 10000,
    };
    if (nextPageToken) params.page_token = nextPageToken;

    try {
      const res = await axios.get("https://data.alpaca.markets/v2/stocks/bars", { params, headers, timeout: 8000 });
      const bars = res.data?.bars?.[symbol];
      if (!Array.isArray(bars) || bars.length === 0) break;

      for (const bar of bars) {
        allCandles.push({ time: new Date(bar.t).getTime(), open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v || 0 });
      }
      nextPageToken = res.data?.next_page_token || null;
      pageCount++;
    } catch (err: any) {
      if (err?.response?.status === 403 || err?.response?.status === 401) {
        throw new Error(`Alpaca: no access for ${symbol} (${err.response.status})`);
      }
      throw err;
    }
  } while (nextPageToken && pageCount < 100);

  if (allCandles.length === 0) throw new Error(`Alpaca: no data for ${symbol}/${timeframe}`);
  return allCandles.sort((a, b) => a.time - b.time);
}

export async function fetchAlpacaBatchCandles(
  symbols: string[], timeframe: Timeframe, startDate: string, endDate: string
): Promise<Map<string, Candle[]>> {
  const apiKey = ENV.alpacaApiKey;
  const secretKey = ENV.alpacaSecretKey;
  if (!apiKey || !secretKey) throw new Error("ALPACA keys not set");
  if (!BASE_TIMEFRAMES.includes(timeframe)) throw new Error(`Alpaca batch: unsupported ${timeframe}`);

  const tfMap: Record<string, string> = { "15m": "15Min", "1h": "1Hour", "1d": "1Day" };
  const alpacaTf = tfMap[timeframe];
  if (!alpacaTf) throw new Error(`Alpaca unsupported: ${timeframe}`);

  const headers = { "APCA-API-KEY-ID": apiKey, "APCA-API-SECRET-KEY": secretKey };
  const result = new Map<string, Candle[]>();
  for (const sym of symbols) result.set(sym, []);

  let nextPageToken: string | null = null;
  let pageCount = 0;
  const symbolsStr = symbols.join(",");

  do {
    const params: Record<string, any> = {
      symbols: symbolsStr, timeframe: alpacaTf, start: startDate, end: endDate, limit: 10000,
    };
    if (nextPageToken) params.page_token = nextPageToken;

    try {
      const res = await axios.get("https://data.alpaca.markets/v2/stocks/bars", { params, headers, timeout: 8000 });
      const bars = res.data?.bars;
      if (bars) {
        for (const [sym, symBars] of Object.entries(bars)) {
          if (!Array.isArray(symBars)) continue;
          const existing = result.get(sym) || [];
          for (const bar of symBars as any[]) {
            existing.push({ time: new Date(bar.t).getTime(), open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v || 0 });
          }
          result.set(sym, existing);
        }
      }
      nextPageToken = res.data?.next_page_token || null;
      pageCount++;
    } catch (err) {
      console.error(`[MarketData] Alpaca batch page ${pageCount} error:`, err);
      break;
    }
  } while (nextPageToken && pageCount < 200);

  for (const [sym, candles] of Array.from(result.entries())) {
    result.set(sym, candles.sort((a: Candle, b: Candle) => a.time - b.time));
  }
  return result;
}

// --- Stooq (free, daily only, no API key needed) ---
async function fetchStooqCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  if (timeframe !== "1d") throw new Error(`Stooq: only 1d supported`);
  const stooqSymbol = symbol.replace(".", "-") + ".US";
  const res = await axios.get(`https://stooq.com/q/d/l/`, {
    params: { s: stooqSymbol.toLowerCase(), i: "d" },
    timeout: 8000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    responseType: "text",
  });
  const lines = (res.data as string).trim().split("\n");
  if (lines.length < 2) throw new Error("Stooq: no data");
  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const [date, open, high, low, close, vol] = parts;
    const o = parseFloat(open); const h = parseFloat(high);
    const l = parseFloat(low); const c = parseFloat(close);
    if (isNaN(o) || isNaN(c)) continue;
    candles.push({
      time: new Date(date + "T00:00:00Z").getTime(),
      open: o, high: h, low: l, close: c,
      volume: parseInt(vol || "0") || 0,
    });
  }
  if (candles.length === 0) throw new Error(`Stooq: no data for ${symbol}`);
  return candles.sort((a, b) => a.time - b.time);
}

// --- Yahoo Finance (v8 chart API, no API key needed) ---
async function fetchYahooCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  if (!BASE_TIMEFRAMES.includes(timeframe)) throw new Error(`Yahoo: unsupported ${timeframe}`);
  const RANGE_MAP: Record<string, string> = { "15m": "60d", "1h": "730d", "1d": "10y" };
  const INTERVAL_MAP: Record<string, string> = { "15m": "15m", "1h": "60m", "1d": "1d" };
  const interval = INTERVAL_MAP[timeframe];
  const range = RANGE_MAP[timeframe];

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  ];

  let res: any = null;
  for (const url of urls) {
    try {
      res = await axios.get(url, {
        params: { interval, range },
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Referer: "https://finance.yahoo.com/",
        },
      });
      if (res.data?.chart?.result?.[0]) break;
    } catch { /* try next */ }
  }
  if (!res) throw new Error("Yahoo: all URLs failed");
  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo: no data");

  const timestamps: number[] = result.timestamp || [];
  const quotes = result.indicators.quote[0];
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quotes.close[i] != null && !isNaN(quotes.close[i])) {
      candles.push({
        time: timestamps[i] * 1000,
        open: quotes.open[i] || quotes.close[i],
        high: quotes.high[i] || quotes.close[i],
        low: quotes.low[i] || quotes.close[i],
        close: quotes.close[i],
        volume: quotes.volume[i] || 0,
      });
    }
  }
  if (candles.length === 0) throw new Error(`Yahoo: no data for ${symbol}`);
  return candles;
}

// --- Tiingo (intraday via IEX) ---
async function fetchTiingoIntradayCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const apiKey = ENV.tiingoApiKey;
  if (!apiKey) throw new Error("TIINGO_API_KEY not set");
  if (timeframe !== "15m" && timeframe !== "1h") throw new Error(`Tiingo IEX: unsupported ${timeframe}`);
  const resampleFreq = timeframe === "15m" ? "15min" : "1hour";
  const now = new Date();
  const defaultStart = startDate || new Date(now.getTime() - 730 * 86400000).toISOString().split("T")[0];
  const defaultEnd = endDate || now.toISOString().split("T")[0];
  let res: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await axios.get(`https://api.tiingo.com/iex/${encodeURIComponent(symbol)}/prices`, {
        params: { startDate: defaultStart, endDate: defaultEnd, resampleFreq, columns: "open,high,low,close,volume", token: apiKey },
        timeout: 8000,
      });
      if (res.status !== 429) break;
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    } catch (err: any) {
      if (err?.response?.status === 429) { await new Promise(r => setTimeout(r, (attempt + 1) * 2000)); continue; }
      throw err;
    }
  }
  if (!res || res.status === 429) throw new Error(`Tiingo rate limited for ${symbol}`);
  if (!Array.isArray(res.data) || res.data.length === 0) throw new Error(`Tiingo: no data for ${symbol}`);
  return res.data.map((item: any) => ({
    time: new Date(item.date).getTime(), open: item.open || item.close, high: item.high || item.close,
    low: item.low || item.close, close: item.close, volume: item.volume || 0,
  })).sort((a: Candle, b: Candle) => a.time - b.time);
}

// --- Tiingo (daily) ---
async function fetchTiingoDailyCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const apiKey = ENV.tiingoApiKey;
  if (!apiKey) throw new Error("TIINGO_API_KEY not set");
  if (timeframe !== "1d") throw new Error(`Tiingo daily: unsupported ${timeframe}`);
  const now = new Date();
  const defaultStart = startDate || new Date(now.getTime() - 3650 * 86400000).toISOString().split("T")[0];
  const defaultEnd = endDate || now.toISOString().split("T")[0];
  const res = await axios.get(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`, {
    params: { startDate: defaultStart, endDate: defaultEnd, resampleFreq: "daily", token: apiKey },
    timeout: 8000,
  });
  if (!Array.isArray(res.data) || res.data.length === 0) throw new Error(`Tiingo daily: no data for ${symbol}`);
  return res.data.map((item: any) => ({
    time: new Date(item.date).getTime(), open: item.open || item.adjClose, high: item.high || item.adjClose,
    low: item.low || item.adjClose, close: item.adjClose || item.close, volume: item.volume || 0,
  })).sort((a: Candle, b: Candle) => a.time - b.time);
}

// --- Finnhub (daily only, free tier) ---
async function fetchFinnhubCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const apiKey = ENV.finnhubApiKey;
  if (!apiKey) throw new Error("FINNHUB_API_KEY not set");
  if (timeframe !== "1d") throw new Error(`Finnhub free: only 1d supported`);
  const now = Math.floor(Date.now() / 1000);
  const fromTs = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : now - 3650 * 86400;
  const toTs = endDate ? Math.floor(new Date(endDate + "T23:59:59Z").getTime() / 1000) : now;
  const res = await axios.get("https://finnhub.io/api/v1/stock/candle", {
    params: { symbol, resolution: "D", from: fromTs, to: toTs, token: apiKey }, timeout: 8000,
  });
  const data = res.data;
  if (data.s !== "ok" || !data.t) throw new Error("Finnhub: no data");
  return data.t.map((t: number, i: number) => ({
    time: t * 1000, open: data.o[i], high: data.h[i], low: data.l[i], close: data.c[i], volume: data.v[i] || 0,
  }));
}

// --- AlphaVantage ---
async function fetchAlphaVantageCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const apiKey = ENV.alphaVantageApiKey;
  if (!apiKey) throw new Error("ALPHAVANTAGE_API_KEY not set");
  if (!BASE_TIMEFRAMES.includes(timeframe)) throw new Error(`AV: unsupported ${timeframe}`);
  const functionMap: Record<string, string> = { "15m": "TIME_SERIES_INTRADAY", "1h": "TIME_SERIES_INTRADAY", "1d": "TIME_SERIES_DAILY" };
  const intervalMap: Record<string, string> = { "15m": "15min", "1h": "60min", "1d": "" };
  const func = functionMap[timeframe];
  const interval = intervalMap[timeframe];
  const params: any = { symbol, apikey: apiKey, outputsize: "full", function: func };
  if (interval) { params.interval = interval; params.extended_hours = "false"; }
  const res = await axios.get("https://www.alphavantage.co/query", { params, timeout: 8000 });
  if (res.data?.Note || res.data?.Information) throw new Error(`AV rate limit: ${res.data?.Note || res.data?.Information}`);
  const timeSeriesKey = Object.keys(res.data).find(k => k.startsWith("Time Series"));
  if (!timeSeriesKey || !res.data[timeSeriesKey]) throw new Error("AV: no data");
  const timeSeries = res.data[timeSeriesKey];
  return Object.entries(timeSeries).map(([time, values]: any) => ({
    time: new Date(time).getTime(), open: parseFloat(values["1. open"]), high: parseFloat(values["2. high"]),
    low: parseFloat(values["3. low"]), close: parseFloat(values["4. close"]), volume: parseInt(values["5. volume"] || "0"),
  })).sort((a, b) => a.time - b.time);
}

// --- Polygon.io (free tier, daily only) ---
async function fetchPolygonCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const apiKey = ENV.polygonApiKey;
  if (!apiKey) throw new Error("POLYGON_API_KEY not set");
  if (timeframe !== "1d") throw new Error(`Polygon free: only 1d supported`);
  const now = new Date();
  const from = startDate || new Date(now.getTime() - 3650 * 86400000).toISOString().split("T")[0];
  const to = endDate || now.toISOString().split("T")[0];
  const allCandles: Candle[] = [];
  let nextUrl: string | null = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

  while (nextUrl) {
    const res: any = await axios.get(nextUrl, { timeout: 8000 });
    const results = res.data?.results;
    if (Array.isArray(results)) {
      for (const bar of results) {
        allCandles.push({ time: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v || 0 });
      }
    }
    nextUrl = res.data?.next_url ? res.data.next_url + `&apiKey=${apiKey}` : null;
  }
  if (allCandles.length === 0) throw new Error(`Polygon: no data for ${symbol}`);
  return allCandles.sort((a, b) => a.time - b.time);
}

// --- Twelve Data (free tier, supports intraday) ---
async function fetchTwelveDataCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const apiKey = ENV.twelveDataApiKey;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY not set");
  if (!BASE_TIMEFRAMES.includes(timeframe)) throw new Error(`TwelveData: unsupported ${timeframe}`);
  const intervalMap: Record<string, string> = { "15m": "15min", "1h": "1h", "1d": "1day" };
  const interval = intervalMap[timeframe];
  const now = new Date();
  const start_date = startDate || new Date(now.getTime() - (timeframe === "1d" ? 3650 : 730) * 86400000).toISOString().split("T")[0];
  const end_date = endDate || now.toISOString().split("T")[0];
  const res = await axios.get("https://api.twelvedata.com/time_series", {
    params: { symbol, interval, start_date, end_date, outputsize: 5000, apikey: apiKey, format: "JSON" },
    timeout: 8000,
  });
  if (res.data?.status === "error") throw new Error(`TwelveData: ${res.data.message}`);
  const values = res.data?.values;
  if (!Array.isArray(values) || values.length === 0) throw new Error(`TwelveData: no data for ${symbol}`);
  return values.map((v: any) => ({
    time: new Date(v.datetime).getTime(),
    open: parseFloat(v.open), high: parseFloat(v.high),
    low: parseFloat(v.low), close: parseFloat(v.close),
    volume: parseInt(v.volume || "0"),
  })).sort((a, b) => a.time - b.time);
}

// --- MarketStack (free tier, daily only) ---
async function fetchMarketStackCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const apiKey = ENV.marketstackApiKey;
  if (!apiKey) throw new Error("MARKETSTACK_API_KEY not set");
  if (timeframe !== "1d") throw new Error(`MarketStack free: only 1d supported`);
  const now = new Date();
  const date_from = startDate || new Date(now.getTime() - 3650 * 86400000).toISOString().split("T")[0];
  const date_to = endDate || now.toISOString().split("T")[0];
  const allCandles: Candle[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res: any = await axios.get("https://api.marketstack.com/v1/eod", {
      params: { access_key: apiKey, symbols: symbol, date_from, date_to, limit, offset },
      timeout: 8000,
    });
    const data = res.data?.data;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const bar of data) {
      allCandles.push({
        time: new Date(bar.date).getTime(),
        open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume || 0,
      });
    }
    if (data.length < limit) break;
    offset += limit;
  }
  if (allCandles.length === 0) throw new Error(`MarketStack: no data for ${symbol}`);
  return allCandles.sort((a, b) => a.time - b.time);
}

// ============================================================
// Health monitoring
// ============================================================
async function recordHealth(source: DataSource, timeframe: string, success: boolean, error?: string) {
  try {
    const db = await getDb();
    if (!db) return;
    const existing = await db.select().from(dataSourceHealth)
      .where(and(eq(dataSourceHealth.source, source), eq(dataSourceHealth.timeframe, timeframe))).limit(1);
    if (existing.length === 0) {
      await db.insert(dataSourceHealth).values({
        source, timeframe,
        successCount: success ? 1 : 0, failCount: success ? 0 : 1,
        lastSuccess: success ? new Date() : undefined, lastFail: success ? undefined : new Date(),
        lastError: error || null,
      }).catch(() => {});
    } else {
      if (success) {
        await db.update(dataSourceHealth)
          .set({ successCount: (existing[0].successCount || 0) + 1, lastSuccess: new Date() })
          .where(and(eq(dataSourceHealth.source, source), eq(dataSourceHealth.timeframe, timeframe)));
      } else {
        await db.update(dataSourceHealth)
          .set({ failCount: (existing[0].failCount || 0) + 1, lastFail: new Date(), lastError: error || null })
          .where(and(eq(dataSourceHealth.source, source), eq(dataSourceHealth.timeframe, timeframe)));
      }
    }
  } catch { /* ignore health recording errors */ }
}

// ============================================================
// Unified fetch with failover
// ============================================================
async function getRawCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const sourceChains: Record<string, Array<{ name: DataSource; fn: Function }>> = {
    "1d": [
      { name: "alpaca", fn: fetchAlpacaCandles },
      { name: "stooq", fn: fetchStooqCandles },
      { name: "tiingo", fn: fetchTiingoDailyCandles },
      { name: "yahoo", fn: fetchYahooCandles },
      { name: "finnhub", fn: fetchFinnhubCandles },
      { name: "polygon", fn: fetchPolygonCandles },
      { name: "twelvedata", fn: fetchTwelveDataCandles },
      { name: "marketstack", fn: fetchMarketStackCandles },
      { name: "alphavantage", fn: fetchAlphaVantageCandles },
    ],
    "1h": [
      { name: "alpaca", fn: fetchAlpacaCandles },
      { name: "tiingo", fn: fetchTiingoIntradayCandles },
      { name: "yahoo", fn: fetchYahooCandles },
      { name: "twelvedata", fn: fetchTwelveDataCandles },
      { name: "alphavantage", fn: fetchAlphaVantageCandles },
    ],
    "15m": [
      { name: "alpaca", fn: fetchAlpacaCandles },
      { name: "tiingo", fn: fetchTiingoIntradayCandles },
      { name: "yahoo", fn: fetchYahooCandles },
      { name: "twelvedata", fn: fetchTwelveDataCandles },
      { name: "alphavantage", fn: fetchAlphaVantageCandles },
    ],
  };

  const chain = sourceChains[timeframe];
  if (!chain) throw new Error(`No source chain for: ${timeframe}`);

  for (const source of chain) {
    try {
      console.log(`[MarketData] Trying ${source.name} for ${symbol}/${timeframe}...`);
      const candles = await source.fn(symbol, timeframe, startDate, endDate);
      if (candles.length > 0) {
        console.log(`[MarketData] ✓ ${source.name} → ${candles.length} candles for ${symbol}/${timeframe}`);
        recordHealth(source.name, timeframe, true).catch(() => {});
        return candles;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[MarketData] ✗ ${source.name} failed for ${symbol}/${timeframe}: ${msg}`);
      recordHealth(source.name, timeframe, false, msg).catch(() => {});
    }
  }
  console.error(`[MarketData] All sources failed for ${symbol}/${timeframe}`);
  return [];
}

async function getAggregatedCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  const agg = AGGREGATED_TIMEFRAMES[timeframe];
  if (!agg) throw new Error(`${timeframe} is not aggregated`);
  const baseCandles = await getRawCandles(symbol, agg.base as Timeframe, startDate, endDate);
  if (baseCandles.length === 0) return [];
  if (agg.mode === "week") return aggregateToWeekly(baseCandles);
  return aggregateByFactor(baseCandles, agg.factor);
}

export async function fetchCandles(symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string): Promise<Candle[]> {
  if (BASE_TIMEFRAMES.includes(timeframe)) return getRawCandles(symbol, timeframe, startDate, endDate);
  if (AGGREGATED_TIMEFRAMES[timeframe]) return getAggregatedCandles(symbol, timeframe, startDate, endDate);
  throw new Error(`Unsupported timeframe: ${timeframe}`);
}

export async function fetchHistoricalCandles(symbol: string, timeframe: Timeframe, startDate: string, endDate: string): Promise<Candle[]> {
  const candles = await fetchCandles(symbol, timeframe, startDate, endDate);
  const startTs = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endTs = new Date(`${endDate}T23:59:59.999Z`).getTime();
  return candles.filter(c => Number.isFinite(c.time) && c.time >= startTs && c.time <= endTs).sort((a, b) => a.time - b.time);
}

// Map of source name → fetch function for manual testing
const SOURCE_FETCH_MAP: Record<DataSource, Function> = {
  alpaca: fetchAlpacaCandles,
  stooq: fetchStooqCandles,
  yahoo: fetchYahooCandles,
  tiingo: fetchTiingoDailyCandles,
  finnhub: fetchFinnhubCandles,
  alphavantage: fetchAlphaVantageCandles,
  polygon: fetchPolygonCandles,
  twelvedata: fetchTwelveDataCandles,
  marketstack: fetchMarketStackCandles,
};

export async function testDataSource(
  source: DataSource,
  symbol = "AAPL"
): Promise<{ success: boolean; candleCount: number; latency: number; error?: string }> {
  const fn = SOURCE_FETCH_MAP[source];
  if (!fn) return { success: false, candleCount: 0, latency: 0, error: `Unknown source: ${source}` };
  const start = Date.now();
  try {
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const candles = await fn(symbol, "1d", startDate, end);
    const latency = Date.now() - start;
    const ok = Array.isArray(candles) && candles.length > 0;
    await recordHealth(source, "1d", ok, ok ? undefined : "No candles returned");
    return { success: ok, candleCount: ok ? candles.length : 0, latency };
  } catch (err) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    await recordHealth(source, "1d", false, msg);
    return { success: false, candleCount: 0, latency, error: msg };
  }
}

export async function fetchQuote(symbol: string): Promise<{ price: number; change: number; changePercent: number }> {
  try {
    const apiKey = ENV.alpacaApiKey;
    const secretKey = ENV.alpacaSecretKey;
    if (apiKey && secretKey) {
      const res = await axios.get(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/snapshot`, {
        headers: { "APCA-API-KEY-ID": apiKey, "APCA-API-SECRET-KEY": secretKey },
        timeout: 10000,
      });
      const snap = res.data;
      if (snap?.latestTrade?.p) {
        const price = snap.latestTrade.p;
        const prevClose = snap.prevDailyBar?.c || price;
        return { price, change: price - prevClose, changePercent: prevClose > 0 ? (price - prevClose) / prevClose : 0 };
      }
    }
  } catch { /* fallback */ }

  try {
    const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      params: { interval: "1d", range: "2d" },
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const result = res.data?.chart?.result?.[0];
    if (result) {
      const meta = result.meta;
      const price = meta.regularMarketPrice || 0;
      const prevClose = meta.chartPreviousClose || meta.previousClose || price;
      return { price, change: price - prevClose, changePercent: prevClose > 0 ? (price - prevClose) / prevClose : 0 };
    }
  } catch { /* fallback */ }

  // Try Finnhub quote as last resort
  try {
    const apiKey = ENV.finnhubApiKey;
    if (apiKey) {
      const res = await axios.get("https://finnhub.io/api/v1/quote", {
        params: { symbol, token: apiKey }, timeout: 8000,
      });
      const q = res.data;
      if (q?.c) {
        return { price: q.c, change: q.d || 0, changePercent: q.dp ? q.dp / 100 : 0 };
      }
    }
  } catch { /* ignore */ }

  throw new Error(`No quote data for ${symbol}`);
}
