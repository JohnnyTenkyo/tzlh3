/**
 * Tiger Trade Fee Calculator
 * Commission: $0.0039/share, cap 0.5%
 * Platform fee (fixed): $0.004/share, min $1, cap 0.5%
 */

export interface FeeBreakdown {
  commission: number;
  platformFee: number;
  totalFee: number;
}

export function calculateTradeFees(quantity: number, price: number): FeeBreakdown {
  const totalAmount = quantity * price;
  const commission = Math.min(quantity * 0.0039, totalAmount * 0.005);
  const platformFeeByQty = Math.max(quantity * 0.004, 1);
  const platformFee = Math.min(platformFeeByQty, totalAmount * 0.005);
  return { commission, platformFee, totalFee: commission + platformFee };
}

export function calculateTotalFees(trades: Array<{ quantity: number; price: number }>): number {
  return trades.reduce((total, trade) => total + calculateTradeFees(trade.quantity, trade.price).totalFee, 0);
}
