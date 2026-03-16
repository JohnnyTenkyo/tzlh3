import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import bcrypt from "bcryptjs";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================
// Simple Auth Helpers
// ============================================================

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function registerUser(username: string, password: string, name?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getUserByUsername(username);
  if (existing) throw new Error("用户名已存在");
  const passwordHash = await bcrypt.hash(password, 10);
  const openId = `local_${username}`;
  await db.insert(users).values({
    openId, username, passwordHash,
    name: name || username,
    loginMethod: "password",
    lastSignedIn: new Date(),
  });
  return getUserByOpenId(openId);
}

export async function verifyPassword(username: string, password: string) {
  const user = await getUserByUsername(username);
  if (!user || !user.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  const db = await getDb();
  if (db) await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
  return user;
}

export async function changePassword(userId: number, oldPassword: string, newPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (result.length === 0) throw new Error("用户不存在");
  const user = result[0];
  if (!user.passwordHash) throw new Error("该用户未设置密码");
  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) throw new Error("旧密码错误");
  const newHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));
  return true;
}


// ============================================================
// Warming Progress (缓存预热进度)
// ============================================================
export async function recordWarmingProgress(
  userId: number,
  taskId: string,
  symbol: string,
  status: "pending" | "success" | "failed",
  dataSource?: string,
  errorMessage?: string,
  duration?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { warmingProgress } = await import("../drizzle/schema");
  await db.insert(warmingProgress).values({
    userId,
    taskId,
    symbol,
    status,
    dataSource: dataSource || null,
    errorMessage: errorMessage || null,
    duration: duration || null,
    completedAt: status !== "pending" ? new Date() : null,
  });
}

export async function getWarmingProgress(taskId: string) {
  const db = await getDb();
  if (!db) return [];
  
  const { warmingProgress } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return db.select().from(warmingProgress).where(eq(warmingProgress.taskId, taskId));
}

export async function getIncompleteWarmingProgress(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { warmingProgress } = await import("../drizzle/schema");
  const { eq, ne } = await import("drizzle-orm");
  return db.select().from(warmingProgress)
    .where(
      eq(warmingProgress.userId, userId)
    )
    .orderBy((t) => t.createdAt);
}

// ============================================================
// Warming Stats (缓存预热统计)
// ============================================================
export async function updateWarmingStats(
  userId: number,
  dataSource: string,
  success: boolean,
  duration: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { warmingStats } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  
  const existing = await db.select().from(warmingStats)
    .where(and(eq(warmingStats.userId, userId), eq(warmingStats.dataSource, dataSource)))
    .limit(1);
  
  if (existing.length === 0) {
    await db.insert(warmingStats).values({
      userId,
      dataSource,
      successCount: success ? 1 : 0,
      failCount: success ? 0 : 1,
      totalDuration: duration,
      averageDuration: duration.toString(),
    });
  } else {
    const current = existing[0];
    const successCount = current.successCount || 0;
    const failCount = current.failCount || 0;
    const newSuccessCount = successCount + (success ? 1 : 0);
    const newFailCount = failCount + (success ? 0 : 1);
    const newTotalDuration = Number(current.totalDuration || 0) + duration;
    const newAverageDuration = newTotalDuration / (newSuccessCount + newFailCount);
    
    await db.update(warmingStats)
      .set({
        successCount: newSuccessCount,
        failCount: newFailCount,
        totalDuration: newTotalDuration,
        averageDuration: newAverageDuration.toString(),
        lastUpdated: new Date(),
      })
      .where(and(eq(warmingStats.userId, userId), eq(warmingStats.dataSource, dataSource)));
  }
}

export async function getWarmingStats(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { warmingStats } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return db.select().from(warmingStats).where(eq(warmingStats.userId, userId));
}

// ============================================================
// Scheduled Warming Tasks (定时预热任务)
// ============================================================
export async function createScheduledTask(
  userId: number,
  name: string,
  sectors: string[],
  marketCapTiers: string[],
  cronExpression: string,
  description?: string,
  customSymbols?: string[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { scheduledWarmingTasks } = await import("../drizzle/schema");
  const result = await db.insert(scheduledWarmingTasks).values({
    userId,
    name,
    description: description || null,
    sectors: sectors.length > 0 ? sectors : null,
    marketCapTiers: marketCapTiers.length > 0 ? marketCapTiers : null,
    customSymbols: customSymbols && customSymbols.length > 0 ? customSymbols : null,
    cronExpression,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  
  return result;
}

export async function getScheduledTasks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { scheduledWarmingTasks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return db.select().from(scheduledWarmingTasks).where(eq(scheduledWarmingTasks.userId, userId));
}

export async function getScheduledTaskById(taskId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { scheduledWarmingTasks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(scheduledWarmingTasks).where(eq(scheduledWarmingTasks.id, taskId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateScheduledTask(
  taskId: number,
  updates: {
    name?: string;
    description?: string;
    sectors?: string[];
    marketCapTiers?: string[];
    customSymbols?: string[];
    cronExpression?: string;
    isEnabled?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { scheduledWarmingTasks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  const updateData: Record<string, any> = { updatedAt: new Date() };
  
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.sectors !== undefined) updateData.sectors = updates.sectors.length > 0 ? updates.sectors : null;
  if (updates.marketCapTiers !== undefined) updateData.marketCapTiers = updates.marketCapTiers.length > 0 ? updates.marketCapTiers : null;
  if (updates.customSymbols !== undefined) updateData.customSymbols = updates.customSymbols && updates.customSymbols.length > 0 ? updates.customSymbols : null;
  if (updates.cronExpression !== undefined) updateData.cronExpression = updates.cronExpression;
  if (updates.isEnabled !== undefined) updateData.isEnabled = updates.isEnabled;
  
  await db.update(scheduledWarmingTasks)
    .set(updateData)
    .where(eq(scheduledWarmingTasks.id, taskId));
}

export async function deleteScheduledTask(taskId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { scheduledWarmingTasks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  await db.delete(scheduledWarmingTasks).where(eq(scheduledWarmingTasks.id, taskId));
}

export async function updateScheduledTaskExecution(taskId: number, nextExecutedAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { scheduledWarmingTasks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  await db.update(scheduledWarmingTasks)
    .set({
      lastExecutedAt: new Date(),
      nextExecutedAt,
      updatedAt: new Date(),
    })
    .where(eq(scheduledWarmingTasks.id, taskId));
}

export async function getEnabledScheduledTasks() {
  const db = await getDb();
  if (!db) return [];
  
  const { scheduledWarmingTasks } = await import("../drizzle/schema");
  const { eq, lte } = await import("drizzle-orm");
  
  return db.select().from(scheduledWarmingTasks)
    .where(eq(scheduledWarmingTasks.isEnabled, true));
}
