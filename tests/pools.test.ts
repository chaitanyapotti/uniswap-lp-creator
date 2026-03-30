import { describe, it, expect } from 'vitest';
import {
  parseDefiLlamaPools,
  parseDexScreenerPrices,
  FEE_TIER_MAP,
} from '../src/pools.js';

describe('FEE_TIER_MAP', () => {
  it('maps fee amounts to tick spacings', () => {
    expect(FEE_TIER_MAP[100]).toBe(1);
    expect(FEE_TIER_MAP[500]).toBe(10);
    expect(FEE_TIER_MAP[3000]).toBe(60);
    expect(FEE_TIER_MAP[10000]).toBe(200);
  });
});

describe('parseDefiLlamaPools', () => {
  it('parses DefiLlama response into PoolData array', () => {
    const raw = [
      {
        pool: 'abc-123',
        project: 'uniswap-v3',
        chain: 'Ethereum',
        symbol: 'USDC-WETH',
        tvlUsd: 15_000_000,
        apy: 12.5,
        apyBase: 10.2,
        volumeUsd1d: 2_100_000,
        volumeUsd7d: 14_800_000,
      },
    ];
    const result = parseDefiLlamaPools(raw);
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe('v3');
    expect(result[0].apy).toBe(12.5);
    expect(result[0].tvlUsd).toBe(15_000_000);
  });

  it('detects v4 pools', () => {
    const raw = [
      {
        pool: 'xyz-456',
        project: 'uniswap-v4',
        chain: 'Ethereum',
        symbol: 'USDC-WETH',
        tvlUsd: 5_000_000,
        apy: 18.0,
        apyBase: 15.0,
        volumeUsd1d: 1_000_000,
        volumeUsd7d: 7_000_000,
      },
    ];
    const result = parseDefiLlamaPools(raw);
    expect(result[0].version).toBe('v4');
  });

  it('returns empty array for empty input', () => {
    expect(parseDefiLlamaPools([])).toEqual([]);
  });
});

describe('parseDexScreenerPrices', () => {
  it('extracts ETH price from DexScreener response', () => {
    const raw = [
      {
        dexId: 'uniswap',
        baseToken: { symbol: 'WETH', priceUsd: '1900.50' },
        quoteToken: { symbol: 'USDC', priceUsd: '1.00' },
      },
    ];
    const prices = parseDexScreenerPrices(raw);
    expect(prices.ethUsd).toBeCloseTo(1900.5);
  });
});
