import { describe, it, expect } from 'vitest';
import {
  selectBestPool,
  computeTokenRatio,
  computeSwapRecommendation,
} from '../src/strategy.js';
import type { PoolData, TokenBalance, PriceData } from '../src/types.js';
import { TOKEN_INFO } from '../src/config.js';

const makePool = (
  label: string,
  apy: number,
  version: 'v3' | 'v4' = 'v3',
): PoolData => ({
  pair: {
    label,
    tokenA: label.startsWith('ETH')
      ? TOKEN_INFO.ETH
      : TOKEN_INFO.USDC,
    tokenB: label.endsWith('USDC')
      ? TOKEN_INFO.USDC
      : label.endsWith('USDT')
        ? TOKEN_INFO.USDT
        : TOKEN_INFO.USDT,
  },
  project: `uniswap-${version}`,
  version,
  apy,
  apyBase: apy * 0.8,
  tvlUsd: 10_000_000,
  volumeUsd1d: 1_000_000,
  volumeUsd7d: 7_000_000,
  feeTier: 3000,
  tickSpacing: 60,
  defiLlamaSymbol: `WETH-USDC`,
});

describe('selectBestPool', () => {
  it('picks the pool with the highest APY', () => {
    const pools = [
      makePool('ETH/USDC', 8.0),
      makePool('ETH/USDT', 15.0),
      makePool('USDC/USDT', 5.0),
    ];
    const best = selectBestPool(pools);
    expect(best.pair.label).toBe('ETH/USDT');
    expect(best.apy).toBe(15.0);
  });

  it('throws when no pools available', () => {
    expect(() => selectBestPool([])).toThrow();
  });
});

describe('computeTokenRatio', () => {
  it('returns ~50/50 for price at midpoint of range (stablecoin pair)', () => {
    const ratio = computeTokenRatio(1.0, 0.9, 1.1);
    expect(ratio.tokenARatio).toBeCloseTo(0.5, 1);
    expect(ratio.tokenBRatio).toBeCloseTo(0.5, 1);
  });

  it('ratios sum to 1', () => {
    const ratio = computeTokenRatio(2000, 1800, 2200);
    expect(ratio.tokenARatio + ratio.tokenBRatio).toBeCloseTo(1.0);
  });

  it('tokenB ratio increases when price is near max', () => {
    const mid = computeTokenRatio(2000, 1800, 2200);
    const high = computeTokenRatio(2150, 1800, 2200);
    expect(high.tokenBRatio).toBeGreaterThan(mid.tokenBRatio);
  });
});

describe('computeSwapRecommendation', () => {
  const prices: PriceData = { ethUsd: 2000, usdcUsd: 1, usdtUsd: 1 };

  it('recommends swap when user has only ETH and needs ETH/USDC', () => {
    const balances: TokenBalance[] = [
      { symbol: 'ETH', address: 'NATIVE', balance: 10n * 10n ** 18n, decimals: 18, formatted: '10.0', valueUsd: 20000 },
      { symbol: 'USDC', address: '0x...', balance: 0n, decimals: 6, formatted: '0.0', valueUsd: 0 },
      { symbol: 'USDT', address: '0x...', balance: 0n, decimals: 6, formatted: '0.0', valueUsd: 0 },
    ];
    const pool = makePool('ETH/USDC', 12);
    const rec = computeSwapRecommendation(pool, balances, prices, 0.10);
    expect(rec.needed).toBe(true);
    expect(rec.sellToken.symbol).toBe('ETH');
    expect(rec.buyToken.symbol).toBe('USDC');
    expect(rec.sellAmount).toBeGreaterThan(0);
  });

  it('recommends no swap when user has exact ratio', () => {
    const balances: TokenBalance[] = [
      { symbol: 'ETH', address: 'NATIVE', balance: 5n * 10n ** 18n, decimals: 18, formatted: '5.0', valueUsd: 10000 },
      { symbol: 'USDC', address: '0x...', balance: 10_000_000_000n, decimals: 6, formatted: '10000.0', valueUsd: 10000 },
      { symbol: 'USDT', address: '0x...', balance: 0n, decimals: 6, formatted: '0.0', valueUsd: 0 },
    ];
    const pool = makePool('ETH/USDC', 12);
    const rec = computeSwapRecommendation(pool, balances, prices, 0.10);
    expect(rec.sellAmount).toBeLessThan(5);
  });

  it('recommends swap when user only holds a third token not in the pool', () => {
    const balances: TokenBalance[] = [
      { symbol: 'ETH', address: 'NATIVE', balance: 0n, decimals: 18, formatted: '0.0', valueUsd: 0 },
      { symbol: 'USDC', address: '0x...', balance: 0n, decimals: 6, formatted: '0.0', valueUsd: 0 },
      { symbol: 'USDT', address: '0x...', balance: 5_000_000_000n, decimals: 6, formatted: '5000.0', valueUsd: 5000 },
    ];
    const pool = makePool('ETH/USDC', 12);
    const rec = computeSwapRecommendation(pool, balances, prices, 0.10);
    expect(rec.needed).toBe(true);
    expect(rec.sellToken.symbol).toBe('USDT');
    expect(rec.sellAmount).toBeGreaterThan(0);
  });
});
