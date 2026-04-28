import { describe, it, expect } from 'vitest';
import {
  selectBestPool,
  computeTokenRatio,
  computeSwapRecommendation,
  estimatePoolFeeYield,
} from '../src/strategy.js';
import type { PoolData, TokenBalance, PriceData } from '../src/types.js';
import { TOKEN_INFO } from '../src/config.js';

const makePool = (
  label: string,
  apy: number,
  overrides: Partial<PoolData> & { version?: 'v3' | 'v4' } = {},
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
  project: `uniswap-${overrides.version ?? 'v3'}`,
  version: overrides.version ?? 'v3',
  apy,
  apyBase: apy * 0.8,
  tvlUsd: overrides.tvlUsd ?? 10_000_000,
  volumeUsd1d: overrides.volumeUsd1d ?? 1_000_000,
  volumeUsd7d: overrides.volumeUsd7d ?? 7_000_000,
  feeTier: overrides.feeTier ?? 3000,
  tickSpacing: overrides.tickSpacing ?? 60,
  defiLlamaSymbol: `WETH-USDC`,
});

describe('estimatePoolFeeYield', () => {
  it('uses DefiLlama apyBase for yield (not v2-style volume/TVL formula)', () => {
    const pool = makePool('ETH/USDC', 10, {
      volumeUsd1d: 5_000_000,
      tvlUsd: 50_000_000,
      feeTier: 3000,
    });
    const est = estimatePoolFeeYield(pool, 10_000);

    expect(est.feeRate).toBeCloseTo(0.003);
    expect(est.dailyPoolFeesUsd).toBeCloseTo(15_000);
    expect(est.volumeToTvlRatio).toBeCloseTo(0.1);

    // apyBase = apy * 0.8 = 8 (from makePool helper)
    expect(est.annualFeeYieldPct).toBeCloseTo(8);
    expect(est.estimatedAnnualEarningsUsd).toBeCloseTo(10_000 * 0.08);
    expect(est.estimatedDailyEarningsUsd).toBeCloseTo((10_000 * 0.08) / 365);
  });

  it('falls back to apy when apyBase is zero', () => {
    const pool = makePool('ETH/USDC', 25, { volumeUsd1d: 1_000_000, tvlUsd: 10_000_000 });
    pool.apyBase = 0;
    const est = estimatePoolFeeYield(pool, 10_000);

    expect(est.annualFeeYieldPct).toBeCloseTo(25);
    expect(est.estimatedAnnualEarningsUsd).toBeCloseTo(10_000 * 0.25);
  });

  it('higher fee tier collects more fees on same volume', () => {
    const low = makePool('ETH/USDC', 10, { feeTier: 500, volumeUsd1d: 2_000_000 });
    const high = makePool('ETH/USDC', 10, { feeTier: 3000, volumeUsd1d: 2_000_000 });
    const estLow = estimatePoolFeeYield(low, 10_000);
    const estHigh = estimatePoolFeeYield(high, 10_000);

    expect(estHigh.dailyPoolFeesUsd).toBeGreaterThan(estLow.dailyPoolFeesUsd);
  });

  it('does NOT inflate the headline yield based on naive volume/TVL', () => {
    // A USDC/USDT-like trap pool: huge volume, tiny TVL, 0.30% nominal fee.
    // The v2 formula would produce >9000% APR; DefiLlama's apy reflects the
    // realistic (much lower) concentrated-liquidity yield.
    const trapPool = makePool('USDC/USDT', 16, {
      feeTier: 3000,
      volumeUsd1d: 10_800_000,
      tvlUsd: 122_000,
    });
    const est = estimatePoolFeeYield(trapPool, 50_000);

    // apyBase = 16 * 0.8 = 12.8; must NOT be the v2 figure (~9670%)
    expect(est.annualFeeYieldPct).toBeLessThan(50);
    expect(est.annualFeeYieldPct).toBeCloseTo(12.8);
  });
});

describe('selectBestPool', () => {
  it('prefers the pool with higher DefiLlama APY', () => {
    // High volume/TVL ratio used to win under the v2 formula even with low APY;
    // now selection is driven by DefiLlama's apyBase/apy.
    const lowApyHighVolTvl = makePool('ETH/USDC', 10.0, {
      volumeUsd1d: 20_000_000,
      tvlUsd: 10_000_000,
      feeTier: 3000,
    });
    const highApy = makePool('ETH/USDT', 30.0, {
      volumeUsd1d: 100_000,
      tvlUsd: 50_000_000,
      feeTier: 500,
    });
    const best = selectBestPool([lowApyHighVolTvl, highApy], 10_000);
    expect(best.pair.label).toBe('ETH/USDT');
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
    expect(rec.sellAmount).toBeLessThan(1);
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
