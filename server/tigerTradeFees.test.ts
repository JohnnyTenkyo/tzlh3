import { describe, it, expect } from "vitest";
import { calculateTradeFees } from "./tigerTradeFees";

describe("Tiger Trade Fees Calculator", () => {
  it("should calculate commission correctly", () => {
    // 100 shares at $100 = $10,000
    // Commission: 100 * 0.0039 = $0.39
    const fees = calculateTradeFees(100, 100);
    expect(fees.commission).toBeCloseTo(0.39, 2);
  });

  it("should enforce minimum platform fee of $1 for large orders", () => {
    // 1000 shares at $1000 = $1,000,000
    // Platform fee: min(max(1000 * 0.004, 1), 1000000 * 0.005) = min($4, $5000) = $4
    const fees = calculateTradeFees(1000, 1000);
    expect(fees.platformFee).toBeGreaterThanOrEqual(1);
  });

  it("should cap fees at 0.5% of total amount", () => {
    // 1000 shares at $100 = $100,000
    // Commission: min(1000 * 0.0039, 100000 * 0.005) = min($3.9, $500) = $3.9
    // Platform fee: min(max(1000 * 0.004, 1), 100000 * 0.005) = min($4, $500) = $4
    const fees = calculateTradeFees(1000, 100);
    expect(fees.commission).toBe(3.9);
    expect(fees.platformFee).toBe(4);
  });

  it("should calculate total fee correctly", () => {
    // 100 shares at $100
    const fees = calculateTradeFees(100, 100);
    expect(fees.totalFee).toBe(fees.commission + fees.platformFee);
  });

  it("should handle large orders with 0.5% cap", () => {
    // 10000 shares at $50 = $500,000
    // Commission: min(10000 * 0.0039, 500000 * 0.005) = min($39, $2500) = $39
    // Platform fee: min(max(10000 * 0.004, 1), 500000 * 0.005) = min($40, $2500) = $40
    const fees = calculateTradeFees(10000, 50);
    expect(fees.commission).toBe(39);
    expect(fees.platformFee).toBe(40);
    expect(fees.totalFee).toBe(79);
  });

  it("should handle small orders with minimum platform fee", () => {
    // 1 share at $100 = $100
    // Commission: min(1 * 0.0039, 100 * 0.005) = min($0.0039, $0.5) = $0.0039
    // Platform fee: min(max(1 * 0.004, 1), 100 * 0.005) = min($1, $0.5) = $0.5 (capped at 0.5%)
    const fees = calculateTradeFees(1, 100);
    expect(fees.commission).toBeCloseTo(0.0039, 4);
    expect(fees.platformFee).toBe(0.5); // Capped at 0.5%
  });
});
