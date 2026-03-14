/**
 * Cache Manager v2 - manages historical candle data in the database
 * Features: auto-retry on failure, batch merging, progress tracking
 */
import { getDb } from "./db";
import { historicalCandleCache, cacheMetadata } from "../drizzle/schema";
import { fetchHistoricalCandles, fetchAlpacaBatchCandles, type Candle, type Timeframe } from "./marketData";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const CACHE_TIMEFRAMES: Timeframe[] = ["1d", "1h", "15m"];
const HISTORY_YEARS: Record<string, number> = { "1d": 10, "1h": 5, "15m": 2 };
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function candleDateKey(c: Candle, timeframe: string): string {
  if (timeframe === "1d") return new Date(c.time).toISOString().split("T")[0];
  return new Date(c.time).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ============================================================
// Basic read/write
// ============================================================
export async function getCandlesFromCache(
  symbol: string, timeframe: string, startDate: string, endDate: string
): Promise<Candle[] | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const candles = await db.select({
      date: historicalCandleCache.date,
      open: historicalCandleCache.open,
      high: historicalCandleCache.high,
      low: historicalCandleCache.low,
      close: historicalCandleCache.close,
      volume: historicalCandleCache.volume,
    }).from(historicalCandleCache).where(
      and(
        eq(historicalCandleCache.symbol, symbol),
        eq(historicalCandleCache.timeframe, timeframe),
        gte(historicalCandleCache.date, startDate),
        lte(historicalCandleCache.date, endDate)
      )
    ).orderBy(historicalCandleCache.date);

    if (candles.length === 0) return null;
    return candles.map(c => ({
      time: new Date(c.date).getTime(),
      open: Number(c.open), high: Number(c.high), low: Number(c.low),
      close: Number(c.close), volume: Number(c.volume),
    }));
  } catch (error) {
    console.error(`[Cache] Error fetching ${symbol}/${timeframe}:`, error);
    return null;
  }
}

export async function saveCandlesToCache(symbol: string, timeframe: string, candles: Candle[]): Promise<void> {
  if (candles.length === 0) return;
  try {
    const db = await getDb();
    if (!db) return;
    const batchSize = 500;
    for (let i = 0; i < candles.length; i += batchSize) {
      const batch = candles.slice(i, i + batchSize);
      const values = batch.map(c => ({
        symbol, timeframe,
        date: candleDateKey(c, timeframe),
        open: String(c.open), high: String(c.high), low: String(c.low),
        close: String(c.close), volume: c.volume,
      }));
      try {
        await db.insert(historicalCandleCache).values(values).onDuplicateKeyUpdate({
          set: {
            open: sql`VALUES(open)`,
            high: sql`VALUES(high)`,
            low: sql`VALUES(low)`,
            close: sql`VALUES(close)`,
            volume: sql`VALUES(volume)`,
          }
        });
      } catch (err: any) {
        if (!err?.message?.includes("Duplicate")) throw err;
      }
    }
    await updateCacheMetadata(symbol, timeframe);
  } catch (error) {
    console.error(`[Cache] Error saving ${symbol}/${timeframe}:`, error);
  }
}

async function updateCacheMetadata(symbol: string, timeframe: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    // Use COUNT and MIN/MAX for efficiency instead of fetching all rows
    const stats = await db.select({
      cnt: sql<number>`COUNT(*)`,
      oldest: sql<string>`MIN(date)`,
      newest: sql<string>`MAX(date)`,
    }).from(historicalCandleCache).where(
      and(eq(historicalCandleCache.symbol, symbol), eq(historicalCandleCache.timeframe, timeframe))
    );

    if (!stats[0] || stats[0].cnt === 0) return;
    const { cnt, oldest, newest } = stats[0];

    const existing = await db.select().from(cacheMetadata).where(
      and(eq(cacheMetadata.symbol, symbol), eq(cacheMetadata.timeframe, timeframe))
    ).limit(1);

    if (existing.length === 0) {
      await db.insert(cacheMetadata).values({
        symbol, timeframe, oldestDate: oldest, newestDate: newest,
        candleCount: cnt, status: "partial",
      });
    } else {
      await db.update(cacheMetadata).set({
        oldestDate: oldest, newestDate: newest,
        candleCount: cnt, status: "partial",
      }).where(and(eq(cacheMetadata.symbol, symbol), eq(cacheMetadata.timeframe, timeframe)));
    }
  } catch (error) {
    console.error(`[Cache] Error updating metadata for ${symbol}/${timeframe}:`, error);
  }
}

// ============================================================
// Cache warming with auto-retry
// ============================================================
let isCacheWarming = false;
let cacheWarmingProgress = { total: 0, completed: 0, current: "", errors: 0, retrying: 0 };

export function getCacheWarmingStatus() {
  return { isWarming: isCacheWarming, ...cacheWarmingProgress };
}

async function fetchWithRetry(
  symbol: string, timeframe: Timeframe, startDate: string, endDate: string
): Promise<Candle[]> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const candles = await fetchHistoricalCandles(symbol, timeframe, startDate, endDate);
      if (candles.length > 0) return candles;
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        console.log(`[Cache] Retry ${attempt + 1}/${MAX_RETRIES} for ${symbol}/${timeframe} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  return [];
}

export async function warmCacheForSymbols(
  symbols: string[],
  timeframes: Timeframe[] = ["1d"],
  onProgress?: (msg: string) => void
): Promise<{ success: number; failed: number }> {
  if (isCacheWarming) throw new Error("Cache warming already in progress");
  isCacheWarming = true;
  cacheWarmingProgress = { total: symbols.length * timeframes.length, completed: 0, current: "", errors: 0, retrying: 0 };

  let success = 0;
  let failed = 0;
  const failedSymbols: Array<{ symbol: string; timeframe: Timeframe }> = [];

  try {
    for (const tf of timeframes) {
      const now = new Date();
      const years = HISTORY_YEARS[tf] || 5;
      const startDate = formatDate(new Date(now.getTime() - years * 365 * 86400000));
      const endDate = formatDate(now);

      // For daily/hourly data, use Alpaca batch (up to 50 symbols at a time)
      if (tf === "1d" || tf === "1h") {
        const batchSize = 50; // Alpaca supports up to 200, but 50 is safer
        for (let i = 0; i < symbols.length; i += batchSize) {
          const batch = symbols.slice(i, i + batchSize);
          cacheWarmingProgress.current = `${tf}: ${batch[0]}...${batch[batch.length - 1]} (${i + 1}-${Math.min(i + batchSize, symbols.length)}/${symbols.length})`;
          onProgress?.(cacheWarmingProgress.current);

          try {
            const batchResult = await fetchAlpacaBatchCandles(batch, tf, startDate, endDate);
            for (const [sym, candles] of Array.from(batchResult.entries())) {
              if (candles.length > 0) {
                await saveCandlesToCache(sym, tf, candles);
                success++;
              } else {
                // Mark for retry
                failedSymbols.push({ symbol: sym, timeframe: tf });
              }
              cacheWarmingProgress.completed++;
            }
            // Handle symbols not in batch result
            for (const sym of batch) {
              if (!batchResult.has(sym)) {
                failedSymbols.push({ symbol: sym, timeframe: tf });
                cacheWarmingProgress.completed++;
              }
            }
          } catch (err) {
            console.error(`[Cache] Batch fetch failed for ${tf}:`, err);
            // All symbols in this batch need individual retry
            for (const sym of batch) {
              failedSymbols.push({ symbol: sym, timeframe: tf });
              cacheWarmingProgress.completed++;
            }
          }
          // Rate limit between batches
          await new Promise(r => setTimeout(r, 500));
        }
      } else {
        // For other timeframes, fetch individually with retry
        for (const sym of symbols) {
          cacheWarmingProgress.current = `${tf}: ${sym}`;
          try {
            const candles = await fetchHistoricalCandles(sym, tf, startDate, endDate);
            if (candles.length > 0) { await saveCandlesToCache(sym, tf, candles); success++; }
            else { failedSymbols.push({ symbol: sym, timeframe: tf }); }
          } catch { failedSymbols.push({ symbol: sym, timeframe: tf }); }
          cacheWarmingProgress.completed++;
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    // ============================================================
    // Auto-retry failed symbols (up to MAX_RETRIES rounds)
    // ============================================================
    if (failedSymbols.length > 0) {
      console.log(`[Cache] Starting retry for ${failedSymbols.length} failed symbols...`);
      cacheWarmingProgress.retrying = failedSymbols.length;

      for (let round = 0; round < MAX_RETRIES && failedSymbols.length > 0; round++) {
        const retryBatch = [...failedSymbols];
        failedSymbols.length = 0;

        cacheWarmingProgress.current = `重试第${round + 1}轮: ${retryBatch.length}个失败项`;
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (round + 1)));

        for (const item of retryBatch) {
          const now = new Date();
          const years = HISTORY_YEARS[item.timeframe] || 5;
          const startDate = formatDate(new Date(now.getTime() - years * 365 * 86400000));
          const endDate = formatDate(now);

          cacheWarmingProgress.current = `重试: ${item.symbol}/${item.timeframe} (第${round + 1}轮)`;
          try {
            const candles = await fetchWithRetry(item.symbol, item.timeframe, startDate, endDate);
            if (candles.length > 0) {
              await saveCandlesToCache(item.symbol, item.timeframe, candles);
              success++;
              cacheWarmingProgress.retrying--;
            } else {
              failedSymbols.push(item);
            }
          } catch {
            failedSymbols.push(item);
          }
          await new Promise(r => setTimeout(r, 300));
        }
      }

      failed = failedSymbols.length;
      cacheWarmingProgress.errors = failed;
    }
  } finally {
    isCacheWarming = false;
    cacheWarmingProgress.current = failed > 0
      ? `完成: ${success}成功, ${failed}失败`
      : `全部完成: ${success}个`;
  }

  return { success, failed };
}

export async function getCacheStatus(): Promise<Array<{
  symbol: string; timeframe: string; candleCount: number | null;
  oldestDate: string | null; newestDate: string | null; status: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    symbol: cacheMetadata.symbol,
    timeframe: cacheMetadata.timeframe,
    candleCount: cacheMetadata.candleCount,
    oldestDate: cacheMetadata.oldestDate,
    newestDate: cacheMetadata.newestDate,
    status: cacheMetadata.status,
  }).from(cacheMetadata).orderBy(cacheMetadata.symbol, cacheMetadata.timeframe);
}

/**
 * Get candles with cache-first strategy
 * Has a 30s total timeout to prevent hanging on slow/failing data sources
 */
export async function getCandlesWithCache(
  symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string
): Promise<Candle[]> {
  const now = new Date();
  const sd = startDate || formatDate(new Date(now.getTime() - (HISTORY_YEARS[timeframe] || 5) * 365 * 86400000));
  const ed = endDate || formatDate(now);

  // Try cache first (fast path, no timeout needed)
  try {
    const cached = await getCandlesFromCache(symbol, timeframe, sd, ed);
    if (cached && cached.length > 50) return cached;
  } catch { /* ignore cache errors */ }

  // Fetch from API with 30s total timeout to prevent hanging
  try {
    const timeoutPromise = new Promise<Candle[]>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout fetching ${symbol}/${timeframe}`)), 30000)
    );
    const fetchPromise = fetchHistoricalCandles(symbol, timeframe, sd, ed);
    const candles = await Promise.race([fetchPromise, timeoutPromise]);
    if (candles.length > 0) {
      saveCandlesToCache(symbol, timeframe, candles).catch(() => {});
    }
    return candles;
  } catch (err) {
    console.warn(`[Cache] getCandlesWithCache failed for ${symbol}/${timeframe}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
