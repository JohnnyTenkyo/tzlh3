/**
 * Cache Manager v4 - Incremental Update + High-Performance Multi-Source Cache
 *
 * Key improvements over v3:
 * 1. Incremental update: check existing cache before fetching
 *    - Symbols with newestDate within 2 days → SKIP (already up-to-date)
 *    - Symbols with partial cache → fetch only from newestDate+1 (incremental)
 *    - Symbols with no cache → full historical fetch
 * 2. True concurrent fetching with configurable concurrency limit (8 parallel)
 * 3. Alpaca batch: up to 200 symbols per request
 * 4. All 9 data sources used via fetchHistoricalCandles failover chain
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
const CONCURRENCY = 8;           // Max parallel API requests
const ALPACA_BATCH_SIZE = 200;   // Alpaca supports up to 200 symbols per batch
const SAVE_BATCH_SIZE = 500;     // DB insert batch size
// Symbols with newestDate within this many days are considered up-to-date
const UP_TO_DATE_DAYS = 2;

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
    ).orderBy(historicalCandleCache.date).limit(10000); // Limit to prevent loading too much data
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
    if (!stats[0]) return;
    const cnt = Number(stats[0].cnt) || 0;
    if (cnt === 0) return;
    const { oldest, newest } = stats[0];
    const existing = await db.select().from(cacheMetadata).where(
      and(eq(cacheMetadata.symbol, symbol), eq(cacheMetadata.timeframe, timeframe))
    ).limit(1);
    if (existing.length === 0) {
      await db.insert(cacheMetadata).values({
        symbol, timeframe, oldestDate: oldest || new Date().toISOString().split('T')[0], newestDate: newest || new Date().toISOString().split('T')[0],
        candleCount: cnt, status: "partial",
      });
    } else {
      await db.update(cacheMetadata).set({
        oldestDate: oldest || new Date().toISOString().split('T')[0], newestDate: newest || new Date().toISOString().split('T')[0],
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
  skipped: 0,
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

async function processConcurrentBatch(
  symbolsWithDates: Array<{ symbol: string; startDate: string }>,
  timeframe: Timeframe,
  endDate: string,
  semaphore: Semaphore,
  onSymbolDone: (symbol: string, success: boolean) => void
): Promise<{ successes: Map<string, Candle[]>; failures: string[] }> {
  const successes = new Map<string, Candle[]>();
  const failures: string[] = [];

  const tasks = symbolsWithDates.map(({ symbol, startDate }) => async () => {
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
// Main warmCache function - v4 with incremental update
// ============================================================
export async function warmCacheForSymbols(
  symbols: string[],
  timeframes: Timeframe[] = ["1d"],
  onProgress?: (msg: string) => void
): Promise<{ success: number; failed: number; skipped: number }> {
  if (isCacheWarming) throw new Error("Cache warming already in progress");
  isCacheWarming = true;
  cacheWarmingProgress = {
    total: symbols.length * timeframes.length,
    completed: 0,
    skipped: 0,
    current: "初始化...",
    errors: 0,
    retrying: 0,
    sourceStats: {},
    startTime: Date.now(),
  };

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  try {
    for (const tf of timeframes) {
      const now = new Date();
      const years = HISTORY_YEARS[tf] || 5;
      const fullStartDate = formatDate(new Date(now.getTime() - years * 365 * 86400000));
      const endDate = formatDate(now);
      const upToDateThreshold = formatDate(new Date(now.getTime() - UP_TO_DATE_DAYS * 86400000));

      // -------------------------------------------------------
      // Step 0: Load existing cache metadata for incremental logic
      // -------------------------------------------------------
      cacheWarmingProgress.current = `${tf}: 检查已有缓存状态...`;
      onProgress?.(cacheWarmingProgress.current);

      const existingMeta = new Map<string, string>(); // symbol -> newestDate
      try {
        const db = await getDb();
        if (db) {
          const metas = await db.select({
            symbol: cacheMetadata.symbol,
            newestDate: cacheMetadata.newestDate,
          }).from(cacheMetadata).where(eq(cacheMetadata.timeframe, tf));
          for (const m of metas) {
            if (m.newestDate) existingMeta.set(m.symbol, m.newestDate);
          }
        }
      } catch { /* ignore */ }

      // Classify symbols
      const symbolsToSkip: string[] = [];
      const symbolsToProcess: Array<{ symbol: string; startDate: string; isIncremental: boolean }> = [];

      for (const sym of symbols) {
        const newest = existingMeta.get(sym);
        if (!newest) {
          // Never cached → full fetch
          symbolsToProcess.push({ symbol: sym, startDate: fullStartDate, isIncremental: false });
        } else if (newest >= upToDateThreshold) {
          // Already up-to-date → skip
          symbolsToSkip.push(sym);
        } else {
          // Partial cache → incremental fetch from next day
          const nextDay = formatDate(new Date(new Date(newest).getTime() + 86400000));
          symbolsToProcess.push({ symbol: sym, startDate: nextDay, isIncremental: true });
        }
      }

      const fullCount = symbolsToProcess.filter(s => !s.isIncremental).length;
      const incrCount = symbolsToProcess.filter(s => s.isIncremental).length;
      console.log(`[Cache v4] ${tf}: skip=${symbolsToSkip.length} (up-to-date), incremental=${incrCount}, full=${fullCount}`);

      // Update totals
      cacheWarmingProgress.total = symbolsToProcess.length * timeframes.length;
      cacheWarmingProgress.skipped = symbolsToSkip.length;
      totalSkipped += symbolsToSkip.length;

      cacheWarmingProgress.current = `${tf}: 跳过${symbolsToSkip.length}只(已最新), 增量${incrCount}只, 全量${fullCount}只`;
      onProgress?.(cacheWarmingProgress.current);

      if (symbolsToProcess.length === 0) {
        console.log(`[Cache v4] ${tf}: All symbols up-to-date, skipping.`);
        continue;
      }

      // -------------------------------------------------------
      // Phase 1: Alpaca batch (most efficient - up to 200/request)
      // Only works for full-fetch symbols (incremental ones need per-symbol startDate)
      // -------------------------------------------------------
      const alpacaSucceeded = new Set<string>();
      const alpacaFailed: Array<{ symbol: string; startDate: string }> = [];

      // Separate full-fetch (can batch) from incremental (must be individual)
      const batchableSymbols = symbolsToProcess.filter(s => !s.isIncremental).map(s => s.symbol);
      const incrementalSymbols = symbolsToProcess.filter(s => s.isIncremental);

      if (ENV.alpacaApiKey && ENV.alpacaSecretKey && batchableSymbols.length > 0) {
        const totalBatches = Math.ceil(batchableSymbols.length / ALPACA_BATCH_SIZE);
        cacheWarmingProgress.current = `${tf}: Alpaca 批量全量 (${totalBatches} 批, 每批最多 ${ALPACA_BATCH_SIZE} 只)...`;
        onProgress?.(cacheWarmingProgress.current);

        for (let i = 0; i < batchableSymbols.length; i += ALPACA_BATCH_SIZE) {
          const batch = batchableSymbols.slice(i, i + ALPACA_BATCH_SIZE);
          const batchNum = Math.floor(i / ALPACA_BATCH_SIZE) + 1;
          cacheWarmingProgress.current = `${tf}: Alpaca 批次 ${batchNum}/${totalBatches} (${batch.length} 只)`;
          onProgress?.(cacheWarmingProgress.current);

          try {
            const batchResult = await fetchAlpacaBatchCandles(batch, tf, fullStartDate, endDate);
            const saveMap = new Map<string, Candle[]>();

            for (const [sym, candles] of Array.from(batchResult.entries())) {
              if (candles.length > 0) {
                saveMap.set(sym, candles);
                alpacaSucceeded.add(sym);
              } else {
                alpacaFailed.push({ symbol: sym, startDate: fullStartDate });
              }
            }
            for (const sym of batch) {
              if (!batchResult.has(sym)) alpacaFailed.push({ symbol: sym, startDate: fullStartDate });
            }

            await saveAllConcurrently(saveMap, tf);
            cacheWarmingProgress.completed += batch.length;
            totalSuccess += saveMap.size;

            if (!cacheWarmingProgress.sourceStats["alpaca"]) {
              cacheWarmingProgress.sourceStats["alpaca"] = { success: 0, failed: 0 };
            }
            cacheWarmingProgress.sourceStats["alpaca"].success += saveMap.size;
            cacheWarmingProgress.sourceStats["alpaca"].failed += (batch.length - saveMap.size);

            console.log(`[Cache v4] Alpaca batch ${batchNum}/${totalBatches}: ${saveMap.size}/${batch.length} succeeded`);
          } catch (err) {
            console.error(`[Cache v4] Alpaca batch ${batchNum} failed:`, err);
            for (const sym of batch) alpacaFailed.push({ symbol: sym, startDate: fullStartDate });
            cacheWarmingProgress.completed += batch.length;
          }

          if (i + ALPACA_BATCH_SIZE < batchableSymbols.length) {
            await new Promise(r => setTimeout(r, 150));
          }
        }

        console.log(`[Cache v4] Alpaca phase done: ${alpacaSucceeded.size} succeeded, ${alpacaFailed.length} need fallback`);
      } else {
        // No Alpaca keys - all batchable symbols need fallback
        for (const sym of batchableSymbols) alpacaFailed.push({ symbol: sym, startDate: fullStartDate });
        cacheWarmingProgress.completed += batchableSymbols.length;
      }

      // -------------------------------------------------------
      // Phase 2: Concurrent fallback for Alpaca failures + all incremental symbols
      // Uses all other sources (Tiingo, Yahoo, Stooq, Finnhub, Polygon, etc.)
      // -------------------------------------------------------
      const fallbackSymbols = [...alpacaFailed, ...incrementalSymbols];

      if (fallbackSymbols.length > 0) {
        const uniqueFallback = Array.from(
          new Map(fallbackSymbols.map(s => [s.symbol, s])).values()
        );
        console.log(`[Cache v4] Fallback phase: ${uniqueFallback.length} symbols (${incrementalSymbols.length} incremental), concurrency=${CONCURRENCY}`);

        // Adjust completed count (Alpaca phase already counted these)
        const alpacaFailedSymbols = new Set(alpacaFailed.map(s => s.symbol));
        cacheWarmingProgress.completed -= alpacaFailed.length;

        cacheWarmingProgress.current = `${tf}: 并发补充 ${uniqueFallback.length} 只 (并发=${CONCURRENCY})...`;
        onProgress?.(cacheWarmingProgress.current);

        const semaphore = new Semaphore(CONCURRENCY);
        let fallbackSuccess = 0;
        let fallbackFailed = 0;

        const { successes, failures } = await processConcurrentBatch(
          uniqueFallback,
          tf,
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

        if (successes.size > 0) {
          await saveAllConcurrently(successes, tf);
        }

        totalSuccess += fallbackSuccess;
        totalFailed += fallbackFailed;
        cacheWarmingProgress.errors = totalFailed;

        console.log(`[Cache v4] Fallback phase done: ${fallbackSuccess} succeeded, ${fallbackFailed} failed`);

        // -------------------------------------------------------
        // Phase 3: Retry for permanently failed symbols
        // -------------------------------------------------------
        if (failures.length > 0) {
          cacheWarmingProgress.retrying = failures.length;
          cacheWarmingProgress.current = `${tf}: 重试 ${failures.length} 只失败股票...`;
          onProgress?.(cacheWarmingProgress.current);

          console.log(`[Cache v4] Retry phase: ${failures.length} symbols`);

          const retrySemaphore = new Semaphore(Math.max(2, Math.floor(CONCURRENCY / 2)));
          // For retry, use full start date
          const retrySymbols = failures.map(sym => ({ symbol: sym, startDate: fullStartDate }));

          const { successes: retrySuccesses, failures: finalFailures } = await processConcurrentBatch(
            retrySymbols,
            tf,
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

          console.log(`[Cache v4] Retry phase done: ${retrySuccesses.size} recovered, ${finalFailures.length} permanently failed`);
        }
      }
    }
  } finally {
    isCacheWarming = false;
    const elapsed = Math.round((Date.now() - cacheWarmingProgress.startTime) / 1000);
    cacheWarmingProgress.current = totalFailed > 0
      ? `完成: ${totalSuccess} 成功, ${totalSkipped} 跳过(已最新), ${totalFailed} 失败 (耗时 ${elapsed}s)`
      : `全部完成: ${totalSuccess} 成功, ${totalSkipped} 跳过(已最新) (耗时 ${elapsed}s)`;
    console.log(`[Cache v4] Warming complete: ${totalSuccess} success, ${totalSkipped} skipped, ${totalFailed} failed, ${elapsed}s elapsed`);
  }

  return { success: totalSuccess, failed: totalFailed, skipped: totalSkipped };
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
 * Uses incremental fetch: if cache exists but is stale, only fetches missing days.
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
    if (cached && cached.length > 50) {
      // Check if cache is stale (newest date older than 2 days)
      const newestCached = cached[cached.length - 1];
      const newestDate = new Date(newestCached.time);
      const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
      if (newestDate >= twoDaysAgo) {
        return cached; // Cache is fresh, return directly
      }
      // Cache is stale: fetch only the missing days
      try {
        const nextDay = formatDate(new Date(newestDate.getTime() + 86400000));
        const timeoutPromise = new Promise<Candle[]>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout`)), 20000) // 增加到 20 秒
        );
        const newCandles = await Promise.race([
          fetchHistoricalCandles(symbol, timeframe, nextDay, ed),
          timeoutPromise,
        ]);
        if (newCandles.length > 0) {
          saveCandlesToCache(symbol, timeframe, newCandles).catch(() => {});
          return [...cached, ...newCandles];
        }
      } catch { /* ignore incremental fetch error, return cached */ }
      return cached;
    }
  } catch { /* ignore cache errors */ }

  // No cache: full fetch with 60s timeout (increased from 30s for slow APIs)
  try {
    const timeoutPromise = new Promise<Candle[]>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout fetching ${symbol}/${timeframe}`)), 60000) // 增加到 60 秒
    );
    const fetchPromise = fetchHistoricalCandles(symbol, timeframe, sd, ed);
    const candles = await Promise.race([fetchPromise, timeoutPromise]);
    if (candles.length > 0) {
      saveCandlesToCache(symbol, timeframe, candles).catch(() => {});
    }
    return candles;
  } catch (err) {
    console.warn(`[Cache] getCandlesWithCache failed for ${symbol}/${timeframe}: ${err instanceof Error ? err.message : String(err)}`);
    // 尝试返回部分缓存数据而不是空数组
    try {
      const partialCache = await getCandlesFromCache(symbol, timeframe, sd, ed);
      if (partialCache && partialCache.length > 0) {
        console.warn(`[Cache] Returning ${partialCache.length} partial cached candles for ${symbol}/${timeframe}`);
        return partialCache;
      }
    } catch { /* ignore */ }
    return [];
  }
}
