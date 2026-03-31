import { describe, it, expect } from 'vitest';
import { buildCowSwapUrl, buildUniswapLpUrl } from '../src/urls.js';
import { TOKEN_INFO } from '../src/config.js';
import type { SwapRecommendation, BestPoolResult, PoolData } from '../src/types.js';

describe('buildCowSwapUrl', () => {
  it('builds correct CowSwap URL for ETH → USDC swap', () => {
    const rec: SwapRecommendation = {
      needed: true,
      sellToken: TOKEN_INFO.ETH,
      buyToken: TOKEN_INFO.USDC,
      sellAmount: 2.5,
      sellAmountFormatted: '2.500000',
    };
    const url = buildCowSwapUrl(rec);
    expect(url).toContain('swap.cow.fi');
    expect(url).toContain('/1/swap/');
    expect(url).toContain('ETH');
    expect(url).toContain('sellAmount=2.5');
  });

  it('uses token addresses for non-native tokens', () => {
    const rec: SwapRecommendation = {
      needed: true,
      sellToken: TOKEN_INFO.USDC,
      buyToken: TOKEN_INFO.USDT,
      sellAmount: 1000,
      sellAmountFormatted: '1000.000000',
    };
    const url = buildCowSwapUrl(rec);
    expect(url).toContain(TOKEN_INFO.USDC.address);
    expect(url).toContain(TOKEN_INFO.USDT.address);
  });
});

describe('buildUniswapLpUrl', () => {
  const makePoolResult = (): BestPoolResult => {
    const pool: PoolData = {
      pair: {
        label: 'ETH/USDC',
        tokenA: TOKEN_INFO.ETH,
        tokenB: TOKEN_INFO.USDC,
      },
      project: 'uniswap-v3',
      version: 'v3',
      apy: 12,
      apyBase: 10,
      tvlUsd: 15_000_000,
      volumeUsd1d: 2_000_000,
      volumeUsd7d: 14_000_000,
      feeTier: 3000,
      tickSpacing: 60,
      defiLlamaSymbol: 'WETH-USDC',
    };
    return {
      pool,
      currentPrice: 2000,
      minPrice: 1800,
      maxPrice: 2200,
      tokenARatio: 0.5,
      tokenBRatio: 0.5,
    };
  };

  it('builds correct Uniswap LP URL with version in path', () => {
    const url = buildUniswapLpUrl(makePoolResult());
    expect(url).toContain('app.uniswap.org/positions/create/v3');
    expect(url).toContain('chain=ethereum');
    expect(url).toContain('currencyA=NATIVE');
    expect(url).toContain(TOKEN_INFO.USDC.address);
  });

  it('uses v4 path for v4 pools', () => {
    const result = makePoolResult();
    result.pool.version = 'v4';
    result.pool.project = 'uniswap-v4';
    const url = buildUniswapLpUrl(result);
    expect(url).toContain('app.uniswap.org/positions/create/v4');
  });

  it('includes price range state with min and max prices', () => {
    const url = buildUniswapLpUrl(makePoolResult());
    expect(url).toContain('1800');
    expect(url).toContain('2200');
    expect(url).toContain('fullRange');
  });

  it('includes fee configuration', () => {
    const url = buildUniswapLpUrl(makePoolResult());
    expect(url).toContain('feeAmount');
    expect(url).toContain('3000');
    expect(url).toContain('tickSpacing');
    expect(url).toContain('60');
  });
});
