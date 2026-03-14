/**
 * Cache Manager v3 - High-Performance Multi-Source Cache
 *
 * Key improvements over v2:
 * 1. True concurrent fetching with configurable concurrency limit (8 parallel)
 * 2. All 9 data sources used via fetchHistoricalCandles failover chain
 * 3. Alpaca batch: up to 200 symbols per request (was 50)
 * 4. Concurrent fallback: failed symbols fetched in parallel (not serial)
 * 5. Concurrent DB saves: all saves happen in parallel
 * 6. Smart retry: reduced concurrency to avoid hammering APIs
 * 7. Speed tracking: symbols/second metric
 */
import { getDb } from "./db";
import { historicalCandleCache, cacheMetadata } from "../drizzle/schema";
import {
  fetchAlpacaBatchCandles,
  fetchHistoricalCandles,
  type Candle,
  type Timeframe,
} from "./marketData";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { ENV } from "./_core/env";

// ============================================================
// Constants
// ============================================================
const HISTORY_YEARS: Record<string, number> = { "1d": 10, "1h": 5, "15m": 2 };
const MAX_RETRIES = 2;
const CONCURRENCY = 8;           // Max parallel API requests
const ALPACA_BATCH_SIZE = 200;   // Alpaca supports up to 200 symbols per batch
const SAVE_BATCH_SIZE = 500;     // DB insert batch size

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
function candleDateKey(c: Candle, timeframe: string): string {
  if (timeframe === "1d") return new Date(c.time).toISOString().split("T")[0];
  return new Date(c.time).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ============================================================
// Concurrency limiter (semaphore pattern)
// ============================================================
class Semaphore {
  private count: number;
  private queue: Array<() => void> = [];
  constructor(limit: number) { this.count = limit; }
  async acquire(): Promise<void> {
    if (this.count > 0) { this.count--; return; }
    return new Promise(resolve => this.queue.push(resolve));
  }
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.count++;
    }
  }
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
    for (let i = 0; i < candles.length; i += SAVE_BATCH_SIZE) {
      const batch = candles.slice(i, i + SAVE_BATCH_SIZE);
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
// Progress tracking
// ============================================================
let isCacheWarming = false;
let cacheWarmingProgress = {
  total: 0,
  completed: 0,
  current: "",
  errors: 0,
  retrying: 0,
  sourceStats: {} as Record<string, { success: number; failed: number }>,
  startTime: 0,
};

export function getCacheWarmingStatus() {
  const elapsed = cacheWarmingProgress.startTime
    ? (Date.now() - cacheWarmingProgress.startTime) / 1000
    : 0;
  const speed = elapsed > 0 ? Math.round(cacheWarmingProgress.completed / elapsed * 10) / 10 : 0;
  return {
    isWarming: isCacheWarming,
    ...cacheWarmingProgress,
    speed,
    elapsedSeconds: Math.round(elapsed),
  };
}

// ============================================================
// Concurrent batch processing
// ============================================================

/**
 * Save multiple symbols' candles to cache concurrently.
 */
async function saveAllConcurrently(
  symbolCandles: Map<string, Candle[]>,
  timeframe: string
): Promise<void> {
  const savePromises = Array.from(symbolCandles.entries()).map(([symbol, candles]) =>
    saveCandlesToCache(symbol, timeframe, candles).catch(err =>
      console.error(`[Cache] Save failed for ${symbol}/${timeframe}:`, err)
    )
  );
  await Promise.allSettled(savePromises);
}

/**
 * Process a batch of symbols concurrently using the semaphore.
 */
async function processConcurrentBatch(
  symbols: string[],
  timeframe: Timeframe,
  startDate: string,
  endDate: string,
  semaphore: Semaphore,
  onSymbolDone: (symbol: string, success: boolean) => void
): Promise<{ successes: Map<string, Candle[]>; failures: string[] }> {
  const successes = new Map<string, Candle[]>();
  const failures: string[] = [];

  const tasks = symbols.map(symbol => async () => {
    await semaphore.acquire();
    try {
      const candles = await fetchHistoricalCandles(symbol, timeframe, startDate, endDate);
      if (candles.length > 0) {
        successes.set(symbol, candles);
        onSymbolDone(symbol, true);
      } else {
        failures.push(symbol);
        onSymbolDone(symbol, false);
      }
    } catch {
      failures.push(symbol);
      onSymbolDone(symbol, false);
    } finally {
      semaphore.release();
    }
  });

  await Promise.allSettled(tasks.map(t => t()));
  return { successes, failures };
}

// ============================================================
// Main warmCache function - v3 with full concurrency
// ============================================================
export async function warmCacheForSymbols(
  symbols: string[],
  timeframes: Timeframe[] = ["1d"],
  onProgress?: (msg: string) => void
): Promise<{ success: number; failed: number }> {
  if (isCacheWarming) throw new Error("Cache warming already in progress");
  isCacheWarming = true;
  cacheWarmingProgress = {
    total: symbols.length * timeframes.length,
    completed: 0,
    current: "初始化...",
    errors: 0,
    retrying: 0,
    sourceStats: {},
    startTime: Date.now(),
  };

  let totalSuccess = 0;
  let totalFailed = 0;

  try {
    for (const tf of timeframes) {
      const now = new Date();
      const years = HISTORY_YEARS[tf] || 5;
      const startDate = formatDate(new Date(now.getTime() - years * 365 * 86400000));
      const endDate = formatDate(now);

      console.log(`[Cache v3] Starting ${tf} for ${symbols.length} symbols (concurrency=${CONCURRENCY}, alpacaBatch=${ALPACA_BATCH_SIZE})`);
      cacheWarmingProgress.current = `${tf}: 准备批量请求 ${symbols.length} 只股票...`;
      onProgress?.(cacheWarmingProgress.current);

      // -------------------------------------------------------
      // Phase 1: Alpaca batch (most efficient - up to 200/request)
      // -------------------------------------------------------
      const alpacaSucceeded = new Set<string>();
      const alpacaFailed: string[] = [];

      if (ENV.alpacaApiKey && ENV.alpacaSecretKey) {
        const totalBatches = Math.ceil(symbols.length / ALPACA_BATCH_SIZE);
        cacheWarmingProgress.current = `${tf}: Alpaca 批量 (${totalBatches} 批, 每批最多 ${ALPACA_BATCH_SIZE} 只)...`;
        onProgress?.(cacheWarmingProgress.current);

        for (let i = 0; i < symbols.length; i += ALPACA_BATCH_SIZE) {
          const batch = symbols.slice(i, i + ALPACA_BATCH_SIZE);
          const batchNum = Math.floor(i / ALPACA_BATCH_SIZE) + 1;
          cacheWarmingProgress.current = `${tf}: Alpaca 批次 ${batchNum}/${totalBatches} (${batch.length} 只)`;
          onProgress?.(cacheWarmingProgress.current);

          try {
            const batchResult = await fetchAlpacaBatchCandles(batch, tf, startDate, endDate);
            const saveMap = new Map<string, Candle[]>();

            for (const [sym, candles] of Array.from(batchResult.entries())) {
              if (candles.length > 0) {
                saveMap.set(sym, candles);
                alpacaSucceeded.add(sym);
              } else {
                alpacaFailed.push(sym);
              }
            }
            for (const sym of batch) {
              if (!batchResult.has(sym)) alpacaFailed.push(sym);
            }

            // Save all in parallel
            await saveAllConcurrently(saveMap, tf);
            cacheWarmingProgress.completed += batch.length;
            totalSuccess += saveMap.size;

            if (!cacheWarmingProgress.sourceStats["alpaca"]) {
              cacheWarmingProgress.sourceStats["alpaca"] = { success: 0, failed: 0 };
            }
            cacheWarmingProgress.sourceStats["alpaca"].success += saveMap.size;
            cacheWarmingProgress.sourceStats["alpaca"].failed += (batch.length - saveMap.size);

            console.log(`[Cache v3] Alpaca batch ${batchNum}/${totalBatches}: ${saveMap.size}/${batch.length} succeeded`);
          } catch (err) {
            console.error(`[Cache v3] Alpaca batch ${batchNum} failed:`, err);
            for (const sym of batch) alpacaFailed.push(sym);
            cacheWarmingProgress.completed += batch.length;
          }

          // Minimal delay between Alpaca batches
          if (i + ALPACA_BATCH_SIZE < symbols.length) {
            await new Promise(r => setTimeout(r, 150));
          }
        }

        console.log(`[Cache v3] Alpaca phase done: ${alpacaSucceeded.size} succeeded, ${alpacaFailed.length} need fallback`);
      } else {
        // No Alpaca keys - all symbols need fallback
        for (const sym of symbols) alpacaFailed.push(sym);
        cacheWarmingProgress.completed += symbols.length;
      }

      // -------------------------------------------------------
      // Phase 2: Concurrent fallback for Alpaca failures
      // Uses all other sources (Tiingo, Yahoo, Stooq, Finnhub, Polygon, etc.)
      // -------------------------------------------------------
      if (alpacaFailed.length > 0) {
        const uniqueFailed = Array.from(new Set(alpacaFailed));
        console.log(`[Cache v3] Fallback phase: ${uniqueFailed.length} symbols, concurrency=${CONCURRENCY}`);

        // Reset completed count for fallback (we already counted these in Alpaca phase)
        cacheWarmingProgress.completed -= uniqueFailed.length;
        cacheWarmingProgress.current = `${tf}: 并发补充 ${uniqueFailed.length} 只 (并发=${CONCURRENCY})...`;
        onProgress?.(cacheWarmingProgress.current);

        const semaphore = new Semaphore(CONCURRENCY);
        let fallbackSuccess = 0;
        let fallbackFailed = 0;

        const { successes, failures } = await processConcurrentBatch(
          uniqueFailed,
          tf,
          startDate,
          endDate,
          semaphore,
          (symbol, success) => {
            if (success) {
              fallbackSuccess++;
              if (!cacheWarmingProgress.sourceStats["fallback"]) {
                cacheWarmingProgress.sourceStats["fallback"] = { success: 0, failed: 0 };
              }
              cacheWarmingProgress.sourceStats["fallback"].success++;
            } else {
              fallbackFailed++;
            }
            cacheWarmingProgress.completed++;
            const elapsed = (Date.now() - cacheWarmingProgress.startTime) / 1000;
            const speed = elapsed > 0 ? (cacheWarmingProgress.completed / elapsed).toFixed(1) : "0";
            cacheWarmingProgress.current = `${tf}: 并发补充 ${cacheWarmingProgress.completed}/${cacheWarmingProgress.total} (${speed}/s)`;
          }
        );

        // Save fallback results concurrently
        if (successes.size > 0) {
          await saveAllConcurrently(successes, tf);
        }

        totalSuccess += fallbackSuccess;
        totalFailed += fallbackFailed;
        cacheWarmingProgress.errors = totalFailed;

        console.log(`[Cache v3] Fallback phase done: ${fallbackSuccess} succeeded, ${fallbackFailed} failed`);

        // -------------------------------------------------------
        // Phase 3: Concurrent retry for permanently failed symbols
        // -------------------------------------------------------
        if (failures.length > 0) {
          cacheWarmingProgress.retrying = failures.length;
          cacheWarmingProgress.current = `${tf}: 重试 ${failures.length} 只失败股票...`;
          onProgress?.(cacheWarmingProgress.current);

          console.log(`[Cache v3] Retry phase: ${failures.length} symbols`);

          // Use reduced concurrency for retry
          const retrySemaphore = new Semaphore(Math.max(2, Math.floor(CONCURRENCY / 2)));

          const { successes: retrySuccesses, failures: finalFailures } = await processConcurrentBatch(
            failures,
            tf,
            startDate,
            endDate,
            retrySemaphore,
            (symbol, success) => {
              if (success) {
                totalSuccess++;
                totalFailed = Math.max(0, totalFailed - 1);
                if (!cacheWarmingProgress.sourceStats["retry"]) {
                  cacheWarmingProgress.sourceStats["retry"] = { success: 0, failed: 0 };
                }
                cacheWarmingProgress.sourceStats["retry"].success++;
              }
              cacheWarmingProgress.retrying = Math.max(0, cacheWarmingProgress.retrying - 1);
              cacheWarmingProgress.current = `${tf}: 重试中... (剩余 ${cacheWarmingProgress.retrying})`;
            }
          );

          if (retrySuccesses.size > 0) {
            await saveAllConcurrently(retrySuccesses, tf);
          }

          totalFailed = finalFailures.length;
          cacheWarmingProgress.errors = totalFailed;

          console.log(`[Cache v3] Retry phase done: ${retrySuccesses.size} recovered, ${finalFailures.length} permanently failed`);
        }
      }
    }
  } finally {
    isCacheWarming = false;
    const elapsed = Math.round((Date.now() - cacheWarmingProgress.startTime) / 1000);
    cacheWarmingProgress.current = totalFailed > 0
      ? `完成: ${totalSuccess} 成功, ${totalFailed} 失败 (耗时 ${elapsed}s)`
      : `全部完成: ${totalSuccess} 个 (耗时 ${elapsed}s)`;
    console.log(`[Cache v3] Warming complete: ${totalSuccess} success, ${totalFailed} failed, ${elapsed}s elapsed`);
  }

  return { success: totalSuccess, failed: totalFailed };
}

// ============================================================
// getCacheStatus - returns all cache metadata
// ============================================================
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
 * Get candles with cache-first strategy.
 * Has a 30s total timeout to prevent hanging on slow/failing data sources.
 */
export async function getCandlesWithCache(
  symbol: string, timeframe: Timeframe, startDate?: string, endDate?: string
): Promise<Candle[]> {
  const now = new Date();
  const sd = startDate || formatDate(new Date(now.getTime() - (HISTORY_YEARS[timeframe] || 5) * 365 * 86400000));
  const ed = endDate || formatDate(now);

  // Try cache first (fast path)
  try {
    const cached = await getCandlesFromCache(symbol, timeframe, sd, ed);
    if (cached && cached.length > 50) return cached;
  } catch { /* ignore cache errors */ }

  // Fetch from API with 30s timeout
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
