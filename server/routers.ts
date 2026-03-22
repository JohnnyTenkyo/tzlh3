import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, registerUser, verifyPassword, changePassword } from "./db";
import { backtestSessions, backtestTrades, dataSourceHealth } from "../drizzle/schema";
import { eq, desc, inArray } from "drizzle-orm";
import type { Timeframe, DataSource } from "./marketData";
import { testDataSource } from "./marketData";
import { calculateMACD, calculateLadder, calculateCDSignals } from "./indicators";
import { getCandlesWithCache, getCacheStatus, getCacheWarmingStatus, warmCacheForSymbols } from "./cacheManager";
import { runBacktest, STRATEGY_INFO, STRATEGY_DEFAULTS, type StrategyType, type StrategyParams } from "./backtestEngine";
import { analyzeBacktestResult, generateGeminiStrategy, testGeminiConnection } from "./geminiStrategy";
import { STOCK_POOL, filterStocks, type StockInfo, type StockSector, type MarketCapTier } from "@shared/stockPool";
import { SignJWT } from "jose";
import { ENV } from "./_core/env";
import * as XLSX from "xlsx";

function getJwtSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function createSessionToken(openId: string, name: string): Promise<string> {
  const secret = getJwtSecret();
  // Must include openId, appId, name to be compatible with sdk.verifySession()
  return new SignJWT({ openId, appId: ENV.appId || "local", name: name || openId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(secret);
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure
      .input(z.object({
        username: z.string().min(2).max(32),
        password: z.string().min(4).max(64),
        name: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await registerUser(input.username, input.password, input.name);
        if (!user) throw new Error("注册失败");
        const token = await createSessionToken(user.openId, user.name || user.username || "");
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, user: { id: user.id, username: user.username, name: user.name } };
      }),
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const user = await verifyPassword(input.username, input.password);
        if (!user) throw new Error("用户名或密码错误");
        const token = await createSessionToken(user.openId, user.name || user.username || "");
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, user: { id: user.id, username: user.username, name: user.name } };
      }),
    changePassword: protectedProcedure
      .input(z.object({
        oldPassword: z.string(),
        newPassword: z.string().min(4).max(64),
      }))
      .mutation(async ({ ctx, input }) => {
        await changePassword(ctx.user.id, input.oldPassword, input.newPassword);
        return { success: true };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  chart: router({
    getCandles: publicProcedure.input(z.object({
      symbol: z.string(),
      timeframe: z.string().default("1d"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })).query(async ({ input }) => {
      const candles = await getCandlesWithCache(
        input.symbol, input.timeframe as Timeframe, input.startDate, input.endDate
      );
      return { candles };
    }),
    getIndicators: publicProcedure.input(z.object({
      symbol: z.string(),
      timeframe: z.string().default("1d"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })).query(async ({ input }) => {
      const candles = await getCandlesWithCache(
        input.symbol, input.timeframe as Timeframe, input.startDate, input.endDate
      );
      if (candles.length < 30) return { macd: null, ladder: null, cdSignals: [] };
      const macd = calculateMACD(candles);
      const ladder = calculateLadder(candles);
      const cdSignals = calculateCDSignals(candles);
      return {
        macd: {
          diff: macd.diff.map((v, i) => ({ time: candles[i].time, value: v })),
          dea: macd.dea.map((v, i) => ({ time: candles[i].time, value: v })),
          macd: macd.macd.map((v, i) => ({ time: candles[i].time, value: v })),
        },
        ladder: ladder.map(l => ({
          time: l.time, blueUp: l.blueUp, blueDn: l.blueDn, blueMid: l.blueMid,
          yellowUp: l.yellowUp, yellowDn: l.yellowDn, yellowMid: l.yellowMid,
        })),
        cdSignals,
      };
    }),
    getAISignal: publicProcedure.input(z.object({
      symbol: z.string(),
      timeframe: z.string().default("1d"),
    })).query(async ({ input }) => {
      const candles = await getCandlesWithCache(input.symbol, input.timeframe as Timeframe);
      if (candles.length < 30) return { signal: "hold", confidence: 0.5, reasoning: "数据不足" };
      const macd = calculateMACD(candles);
      const ladder = calculateLadder(candles);
      const signal = await generateGeminiStrategy(input.symbol, candles, {
        macd: { diff: macd.diff, dea: macd.dea, macd: macd.macd },
        ladder,
      });
      return signal;
    }),
  }),

  stockPool: router({
    list: publicProcedure.input(z.object({
      // Legacy single-sector filter
      sector: z.string().optional(),
      // New multi-select filters (叠加筛选)
      sectors: z.array(z.string()).optional(),
      marketCapTiers: z.array(z.string()).optional(),
      customSymbols: z.array(z.string()).optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    })).query(({ input }) => {
      const hasNewFilters = (input.sectors && input.sectors.length > 0) ||
        (input.marketCapTiers && input.marketCapTiers.length > 0) ||
        (input.customSymbols && input.customSymbols.length > 0);
      let filtered: StockInfo[];
      if (hasNewFilters) {
        filtered = filterStocks(STOCK_POOL as StockInfo[], {
          sectors: input.sectors as StockSector[],
          marketCapTiers: input.marketCapTiers as MarketCapTier[],
          customSymbols: input.customSymbols,
          searchQuery: input.search,
        });
      } else {
        filtered = STOCK_POOL as StockInfo[];
        if (input.sector) filtered = filtered.filter(s => s.sectors.includes(input.sector as any));
        if (input.search) {
          const q = input.search.toLowerCase();
          filtered = filtered.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
        }
      }
      const total = filtered.length;
      const start = (input.page - 1) * input.pageSize;
      const items = filtered.slice(start, start + input.pageSize);
      return { items, total, page: input.page, pageSize: input.pageSize };
    }),
    sectors: publicProcedure.query(() => {
      const sectorCounts: Record<string, number> = {};
      for (const stock of STOCK_POOL) {
        for (const sector of stock.sectors) sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
      }
      return Object.entries(sectorCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }),
    symbols: publicProcedure.query(() => STOCK_POOL.map(s => ({ symbol: s.symbol, name: s.name }))),
  }),

  backtest: router({
    strategies: publicProcedure.query(() => {
      const strategies = Object.entries(STRATEGY_INFO).map(([key, info]) => ({
        key,
        name: info.name,
        description: info.description,
        defaults: STRATEGY_DEFAULTS[key as StrategyType],
      }));
      strategies.push({
        key: "gemini_ai",
        name: "Gemini AI 智能策略",
        description: "利用 Google Gemini AI 分析技术指标（MACD、黄蓝梯子、RSI、布林带）生成买卖信号。AI 综合多维度指标进行判断，适合捕捉复杂市场模式。",
        defaults: STRATEGY_DEFAULTS["standard"],
      });
      return strategies;
    }),

    create: protectedProcedure.input(z.object({
      name: z.string(),
      strategy: z.enum(["standard", "aggressive", "ladder_cd_combo", "mean_reversion", "macd_volume", "bollinger_squeeze", "gemini_ai"]),
      symbols: z.array(z.string()).min(1),
      startDate: z.string(),
      endDate: z.string(),
      initialCapital: z.number().default(100000),
      maxPositionPct: z.number().default(10),
      strategyParams: z.record(z.string(), z.any()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const result = await db.insert(backtestSessions).values({
        userId: ctx.user.id, name: input.name, strategy: input.strategy as any,
        symbols: input.symbols, startDate: input.startDate, endDate: input.endDate,
        initialCapital: String(input.initialCapital), maxPositionPct: String(input.maxPositionPct),
        strategyParams: input.strategyParams || null,
      }).$returningId();
      const sessionId = result[0].id;
      const actualStrategy = input.strategy === "gemini_ai" ? "standard" : input.strategy as StrategyType;
      runBacktest({
        sessionId, symbols: input.symbols, startDate: input.startDate, endDate: input.endDate,
        strategy: actualStrategy, initialCapital: input.initialCapital, maxPositionPct: input.maxPositionPct,
        strategyParams: input.strategyParams as StrategyParams,
      }).catch(err => console.error("[Backtest] Error:", err));
      return { sessionId };
    }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(backtestSessions)
        .where(eq(backtestSessions.userId, ctx.user.id))
        .orderBy(desc(backtestSessions.createdAt)).limit(100);
    }),

    detail: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessions = await db.select().from(backtestSessions).where(eq(backtestSessions.id, input.id)).limit(1);
      if (sessions.length === 0) throw new Error("Session not found");
      const session = sessions[0];
      if (session.userId !== ctx.user.id) throw new Error("Unauthorized");
      const trades = await db.select().from(backtestTrades)
        .where(eq(backtestTrades.sessionId, input.id)).orderBy(backtestTrades.tradeTime);
      return { session, trades };
    }),

    progress: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const sessions = await db.select({
        status: backtestSessions.status, progress: backtestSessions.progress,
        progressMessage: backtestSessions.progressMessage,
      }).from(backtestSessions).where(eq(backtestSessions.id, input.id)).limit(1);
      return sessions[0] || null;
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessions = await db.select().from(backtestSessions).where(eq(backtestSessions.id, input.id)).limit(1);
      if (sessions.length === 0) throw new Error("Session not found");
      if (sessions[0].userId !== ctx.user.id) throw new Error("Unauthorized");
      await db.delete(backtestTrades).where(eq(backtestTrades.sessionId, input.id));
      await db.delete(backtestSessions).where(eq(backtestSessions.id, input.id));
      return { success: true };
    }),

    batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessions = await db.select().from(backtestSessions).where(inArray(backtestSessions.id, input.ids));
      const ownedIds = sessions.filter(s => s.userId === ctx.user.id).map(s => s.id);
      if (ownedIds.length === 0) throw new Error("No sessions found");
      await db.delete(backtestTrades).where(inArray(backtestTrades.sessionId, ownedIds));
      await db.delete(backtestSessions).where(inArray(backtestSessions.id, ownedIds));
      return { success: true, deleted: ownedIds.length };
    }),

    exportExcel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessions = await db.select().from(backtestSessions).where(eq(backtestSessions.id, input.id)).limit(1);
      if (sessions.length === 0) throw new Error("Session not found");
      if (sessions[0].userId !== ctx.user.id) throw new Error("Unauthorized");
      const session = sessions[0];
      const trades = await db.select().from(backtestTrades)
        .where(eq(backtestTrades.sessionId, input.id)).orderBy(backtestTrades.tradeTime);
      const wb = XLSX.utils.book_new();
      const summaryData = [
        ["回测名称", session.name],
        ["策略", STRATEGY_INFO[session.strategy as StrategyType]?.name || session.strategy],
        ["开始日期", session.startDate],
        ["结束日期", session.endDate],
        ["初始资金", Number(session.initialCapital)],
        ["总收益率", `${(Number(session.totalReturnPct) * 100).toFixed(2)}%`],
        ["总收益", Number(session.totalReturn)],
        ["胜率", `${(Number(session.winRate) * 100).toFixed(1)}%`],
        ["最大回撤", `${(Number(session.maxDrawdown) * 100).toFixed(2)}%`],
        ["夏普比率", Number(session.sharpeRatio)],
        ["总交易数", session.totalTrades],
        ["盈利交易", session.winningTrades],
        ["亏损交易", session.losingTrades],
        ["基准收益(SPY)", `${(Number(session.benchmarkReturn) * 100).toFixed(2)}%`],
      ];
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, "回测概要");
      const tradeRows = trades.map(t => ({
        "时间": new Date(Number(t.tradeTime)).toLocaleString("zh-CN"),
        "股票": t.symbol, "方向": t.side === "buy" ? "买入" : "卖出",
        "数量": Number(t.quantity), "价格": Number(t.price),
        "金额": Number(t.totalAmount), "手续费": Number(t.fee),
        "盈亏": Number(t.pnl), "盈亏%": `${(Number(t.pnlPct) * 100).toFixed(2)}%`,
        "信号类型": t.signalType || "", "原因": t.reason || "",
      }));
      const tradesWs = XLSX.utils.json_to_sheet(tradeRows);
      XLSX.utils.book_append_sheet(wb, tradesWs, "交易记录");
      const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      const base64 = Buffer.from(buffer).toString("base64");
      return { filename: `backtest_${session.name}_${session.id}.xlsx`, base64 };
    }),

    // -------------------------------------------------------
    // Multi-strategy comparison: run multiple strategies in parallel
    // -------------------------------------------------------
    compareStrategies: protectedProcedure.input(z.object({
      name: z.string(),
      strategies: z.array(z.enum(["standard", "aggressive", "ladder_cd_combo", "mean_reversion", "macd_volume", "bollinger_squeeze", "gemini_ai"])).min(2).max(7),
      symbols: z.array(z.string()).min(1),
      startDate: z.string(),
      endDate: z.string(),
      initialCapital: z.number().default(100000),
      maxPositionPct: z.number().default(10),
      strategyParams: z.record(z.string(), z.any()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessionIds: number[] = [];
      for (const strategy of input.strategies) {
        const stratInfo = STRATEGY_INFO[strategy as StrategyType];
        const sessionName = `[对比] ${input.name} - ${stratInfo?.name || strategy}`;
        const result = await db.insert(backtestSessions).values({
          userId: ctx.user.id, name: sessionName,
          strategy: strategy as any,
          symbols: input.symbols, startDate: input.startDate, endDate: input.endDate,
          initialCapital: String(input.initialCapital), maxPositionPct: String(input.maxPositionPct),
          strategyParams: input.strategyParams || null,
        }).$returningId();
        sessionIds.push(result[0].id);
      }
      // Run all backtests in parallel (background)
      input.strategies.forEach((strategy, i) => {
        const actualStrategy = strategy === "gemini_ai" ? "standard" : strategy as StrategyType;
        runBacktest({
          sessionId: sessionIds[i], symbols: input.symbols,
          startDate: input.startDate, endDate: input.endDate,
          strategy: actualStrategy, initialCapital: input.initialCapital,
          maxPositionPct: input.maxPositionPct,
          strategyParams: input.strategyParams as StrategyParams,
        }).catch(err => console.error(`[Compare] Strategy ${strategy} error:`, err));
      });
      return { sessionIds, count: sessionIds.length };
    }),

    // -------------------------------------------------------
    // Compare historical records: fetch multiple sessions for comparison
    // -------------------------------------------------------
    compareRecords: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(2).max(10),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessions = await db.select().from(backtestSessions)
        .where(inArray(backtestSessions.id, input.ids));
      const ownedSessions = sessions.filter(s => s.userId === ctx.user.id);
      if (ownedSessions.length === 0) throw new Error("No sessions found");
      const comparison = ownedSessions.map(s => ({
        id: s.id,
        name: s.name,
        strategy: s.strategy,
        strategyName: STRATEGY_INFO[s.strategy as StrategyType]?.name || s.strategy,
        symbols: (s.symbols as string[]) || [],
        symbolCount: ((s.symbols as string[]) || []).length,
        startDate: s.startDate,
        endDate: s.endDate,
        initialCapital: Number(s.initialCapital),
        maxPositionPct: Number(s.maxPositionPct),
        strategyParams: s.strategyParams,
        stopLoss: (s.strategyParams as any)?.stopLossPct ?? null,
        takeProfit: (s.strategyParams as any)?.takeProfitPct ?? null,
        trailingStop: (s.strategyParams as any)?.trailingStopPct ?? null,
        status: s.status,
        totalReturnPct: Number(s.totalReturnPct) || 0,
        totalReturn: Number(s.totalReturn) || 0,
        winRate: Number(s.winRate) || 0,
        maxDrawdown: Number(s.maxDrawdown) || 0,
        sharpeRatio: Number(s.sharpeRatio) || 0,
        totalTrades: s.totalTrades || 0,
        winningTrades: s.winningTrades || 0,
        losingTrades: s.losingTrades || 0,
        benchmarkReturn: Number(s.benchmarkReturn) || 0,
        equityCurve: (s.resultSummary as any)?.equityCurve || [],
        createdAt: s.createdAt,
      }));
      return { sessions: comparison };
    }),

    aiAnalyze: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessions = await db.select().from(backtestSessions).where(eq(backtestSessions.id, input.id)).limit(1);
      if (sessions.length === 0) throw new Error("Session not found");
      if (sessions[0].userId !== ctx.user.id) throw new Error("Unauthorized");
      const session = sessions[0];
      if (session.status !== "completed") throw new Error("回测尚未完成");
      const analysis = await analyzeBacktestResult({
        strategy: session.strategy, symbols: (session.symbols as string[]) || [],
        startDate: session.startDate, endDate: session.endDate,
        totalReturnPct: Number(session.totalReturnPct) || 0,
        winRate: Number(session.winRate) || 0, maxDrawdown: Number(session.maxDrawdown) || 0,
        sharpeRatio: Number(session.sharpeRatio) || 0, totalTrades: session.totalTrades || 0,
        benchmarkReturn: Number(session.benchmarkReturn) || 0,
      });
      const analysisText = JSON.stringify(analysis);
      await db.update(backtestSessions).set({ aiAnalysis: analysisText }).where(eq(backtestSessions.id, input.id));
      return { analysis };
    }),
  }),

  cache: router({
    status: publicProcedure.query(async () => {
      const status = await getCacheStatus();
      const warming = getCacheWarmingStatus();
      return { cacheEntries: status, warming };
    }),
    warmDaily: protectedProcedure.input(z.object({
      symbols: z.array(z.string()).optional(),
    })).mutation(async ({ input }) => {
      const symbols = input.symbols || STOCK_POOL.map(s => s.symbol);
      warmCacheForSymbols(symbols, ["1d"]).catch(err => console.error("[Cache] Warming error:", err));
      return { message: `开始缓存 ${symbols.length} 只股票的日线数据（自动重试失败项）`, total: symbols.length };
    }),
    warmingStatus: publicProcedure.query(() => getCacheWarmingStatus()),
    resume: protectedProcedure.query(async ({ ctx }) => {
      const { getIncompleteWarmingProgress } = await import("./db");
      const progress = await getIncompleteWarmingProgress(ctx.user.id);
      return progress;
    }),
    stats: protectedProcedure.query(async ({ ctx }) => {
      const { getWarmingStats } = await import("./db");
      const stats = await getWarmingStats(ctx.user.id);
      return stats;
    }),
    createScheduledTask: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        sectors: z.array(z.string()).default([]),
        marketCapTiers: z.array(z.string()).default([]),
        customSymbols: z.array(z.string()).optional(),
        cronExpression: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createScheduledTask } = await import("./db");
        await createScheduledTask(
          ctx.user.id,
          input.name,
          input.sectors,
          input.marketCapTiers,
          input.cronExpression,
          input.description,
          input.customSymbols
        );
        return { success: true };
      }),
    listScheduledTasks: protectedProcedure.query(async ({ ctx }) => {
      const { getScheduledTasks } = await import("./db");
      const tasks = await getScheduledTasks(ctx.user.id);
      return tasks;
    }),
    updateScheduledTask: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        sectors: z.array(z.string()).optional(),
        marketCapTiers: z.array(z.string()).optional(),
        customSymbols: z.array(z.string()).optional(),
        cronExpression: z.string().optional(),
        isEnabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateScheduledTask, getScheduledTaskById } = await import("./db");
        const task = await getScheduledTaskById(input.taskId);
        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await updateScheduledTask(input.taskId, input);
        return { success: true };
      }),
    deleteScheduledTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteScheduledTask, getScheduledTaskById } = await import("./db");
        const task = await getScheduledTaskById(input.taskId);
        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await deleteScheduledTask(input.taskId);
        return { success: true };
      }),
  }),


  ai: router({
    getConfigs: protectedProcedure.query(async ({ ctx }) => {
      const { getAIConfigs } = await import("./db");
      return getAIConfigs(ctx.user.id);
    }),
    createConfig: protectedProcedure
      .input(z.object({
        provider: z.string(),
        apiEndpoint: z.string(),
        apiKey: z.string(),
        model: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createAIConfig } = await import("./db");
        await createAIConfig(ctx.user.id, input);
        return { success: true };
      }),
    updateConfig: protectedProcedure
      .input(z.object({
        configId: z.number(),
        apiEndpoint: z.string().optional(),
        apiKey: z.string().optional(),
        model: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getAIConfigById, updateAIConfig } = await import("./db");
        const config = await getAIConfigById(input.configId);
        if (!config || config.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await updateAIConfig(input.configId, {
          apiEndpoint: input.apiEndpoint,
          apiKey: input.apiKey,
          model: input.model,
          isActive: input.isActive,
        });
        return { success: true };
      }),
    deleteConfig: protectedProcedure
      .input(z.object({ configId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getAIConfigById, deleteAIConfig } = await import("./db");
        const config = await getAIConfigById(input.configId);
        if (!config || config.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await deleteAIConfig(input.configId);
        return { success: true };
      }),
    setDefault: protectedProcedure
      .input(z.object({
        provider: z.string(),
        configId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getAIConfigById, setDefaultAIConfig } = await import("./db");
        const config = await getAIConfigById(input.configId);
        if (!config || config.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await setDefaultAIConfig(ctx.user.id, input.provider, input.configId);
        return { success: true };
      }),
    testConnection: protectedProcedure
      .input(z.object({
        provider: z.string(),
        apiEndpoint: z.string(),
        apiKey: z.string(),
        model: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const response = await fetch(`${input.apiEndpoint}/models`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${input.apiKey}`,
              "Content-Type": "application/json",
            },
          });
          
          if (!response.ok) {
            return {
              success: false,
              error: `HTTP ${response.status}: ${response.statusText}`,
            };
          }
          
          return {
            success: true,
            message: "连接成功",
          };
        } catch (error: any) {
          return {
            success: false,
            error: error?.message || "连接失败",
          };
        }
      }),
  }),
  datasource: router({
    getConfigs: protectedProcedure.query(async ({ ctx }) => {
      const { getCustomDataSources } = await import("./db");
      return getCustomDataSources(ctx.user.id);
    }),
    createConfig: protectedProcedure
      .input(z.object({
        name: z.string(),
        provider: z.string(),
        apiEndpoint: z.string().optional(),
        apiKey: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createCustomDataSource } = await import("./db");
        await createCustomDataSource(ctx.user.id, input);
        return { success: true };
      }),
    updateConfig: protectedProcedure
      .input(z.object({
        sourceId: z.number(),
        name: z.string().optional(),
        provider: z.string().optional(),
        apiEndpoint: z.string().optional(),
        apiKey: z.string().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getCustomDataSourceById, updateCustomDataSource } = await import("./db");
        const source = await getCustomDataSourceById(input.sourceId);
        if (!source || source.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await updateCustomDataSource(input.sourceId, input);
        return { success: true };
      }),
    deleteConfig: protectedProcedure
      .input(z.object({ sourceId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getCustomDataSourceById, deleteCustomDataSource } = await import("./db");
        const source = await getCustomDataSourceById(input.sourceId);
        if (!source || source.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await deleteCustomDataSource(input.sourceId);
        return { success: true };
      }),
  }),
  health: router({
    sources: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dataSourceHealth).orderBy(dataSourceHealth.source);
    }),
    geminiStatus: publicProcedure.query(async () => {
      const results = await testGeminiConnection().catch(() => ({ gemini: false, openai: false }));
      return {
        gemini: {
          connected: results.gemini,
          model: ENV.geminiModel,
          baseUrl: ENV.geminiBaseUrl,
        },
        openai: {
          connected: results.openai,
          model: ENV.openaiModel,
          baseUrl: ENV.openaiBaseUrl,
        },
        // Legacy field for backward compat
        connected: results.gemini || results.openai,
        activeProvider: results.gemini ? "gemini" : results.openai ? "openai" : "none",
      };
    }),
    testSource: publicProcedure
      .input(z.object({
        source: z.enum(["alpaca", "stooq", "yahoo", "tiingo", "finnhub", "alphavantage", "polygon", "twelvedata", "marketstack"]),
        symbol: z.string().default("AAPL"),
      }))
      .mutation(async ({ input }) => {
        const result = await testDataSource(input.source as DataSource, input.symbol);
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
