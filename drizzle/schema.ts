import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  bigint,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ============================================================
// Users
// ============================================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// Backtest Sessions
// ============================================================
export const backtestSessions = mysqlTable("backtest_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  strategy: mysqlEnum("strategy", ["standard", "aggressive", "ladder_cd_combo", "mean_reversion", "macd_volume", "bollinger_squeeze", "gemini_ai"]).notNull(),
  strategyParams: json("strategyParams").$type<Record<string, any>>(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  symbols: json("symbols").$type<string[]>().notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  initialCapital: decimal("initialCapital", { precision: 15, scale: 2 }).default("100000").notNull(),
  maxPositionPct: decimal("maxPositionPct", { precision: 5, scale: 2 }).default("10").notNull(),
  totalReturn: decimal("totalReturn", { precision: 15, scale: 4 }),
  totalReturnPct: decimal("totalReturnPct", { precision: 10, scale: 4 }),
  winRate: decimal("winRate", { precision: 5, scale: 4 }),
  maxDrawdown: decimal("maxDrawdown", { precision: 10, scale: 4 }),
  sharpeRatio: decimal("sharpeRatio", { precision: 10, scale: 4 }),
  totalTrades: int("totalTrades"),
  winningTrades: int("winningTrades"),
  losingTrades: int("losingTrades"),
  benchmarkReturn: decimal("benchmarkReturn", { precision: 10, scale: 4 }),
  progress: int("progress").default(0),
  progressMessage: text("progressMessage"),
  resultSummary: json("resultSummary"),
  aiAnalysis: text("aiAnalysis"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type BacktestSession = typeof backtestSessions.$inferSelect;

// ============================================================
// Backtest Trades
// ============================================================
export const backtestTrades = mysqlTable("backtest_trades", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  side: mysqlEnum("side", ["buy", "sell"]).notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  price: decimal("price", { precision: 15, scale: 4 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(),
  fee: decimal("fee", { precision: 10, scale: 4 }).default("0"),
  reason: text("reason"),
  signalType: varchar("signalType", { length: 50 }),
  tradeTime: bigint("tradeTime", { mode: "number" }).notNull(),
  pnl: decimal("pnl", { precision: 15, scale: 2 }),
  pnlPct: decimal("pnlPct", { precision: 10, scale: 4 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_session").on(table.sessionId),
]);

// ============================================================
// Historical Candle Cache
// ============================================================
export const historicalCandleCache = mysqlTable("historical_candle_cache", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  date: varchar("date", { length: 30 }).notNull(),
  open: decimal("open", { precision: 15, scale: 4 }).notNull(),
  high: decimal("high", { precision: 15, scale: 4 }).notNull(),
  low: decimal("low", { precision: 15, scale: 4 }).notNull(),
  close: decimal("close", { precision: 15, scale: 4 }).notNull(),
  volume: bigint("volume", { mode: "number" }).default(0),
}, (table) => [
  uniqueIndex("idx_symbol_tf_date").on(table.symbol, table.timeframe, table.date),
  index("idx_symbol_tf").on(table.symbol, table.timeframe),
]);

// ============================================================
// Cache Metadata
// ============================================================
export const cacheMetadata = mysqlTable("cache_metadata", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  oldestDate: varchar("oldestDate", { length: 30 }),
  newestDate: varchar("newestDate", { length: 30 }),
  candleCount: int("candleCount").default(0),
  lastUpdated: timestamp("lastUpdated").defaultNow().onUpdateNow(),
  status: mysqlEnum("status", ["empty", "partial", "complete"]).default("empty"),
}, (table) => [
  uniqueIndex("idx_cm_symbol_tf").on(table.symbol, table.timeframe),
]);

// ============================================================
// Data Source Health
// ============================================================
export const dataSourceHealth = mysqlTable("data_source_health", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 30 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  successCount: int("successCount").default(0),
  failCount: int("failCount").default(0),
  lastSuccess: timestamp("lastSuccess"),
  lastFail: timestamp("lastFail"),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
}, (table) => [
  uniqueIndex("idx_dsh_source_tf").on(table.source, table.timeframe),
]);
