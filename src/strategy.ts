import type {
  PoolData,
  PoolFeeEstimate,
  TokenBalance,
  PriceData,
  BestPoolResult,
  SwapRecommendation,
} from './types.js';
import { RANGE_PERCENT } from './config.js';

export function estimatePoolFeeYield(
  pool: PoolData,
  positionValueUsd: number,
): PoolFeeEstimate {
  const feeRate = pool.feeTier / 1_000_000;
  const dailyPoolFeesUsd = pool.volumeUsd1d * feeRate;
  const tvl = pool.tvlUsd > 0 ? pool.tvlUsd : 1;
  const dailyFeeYield = dailyPoolFeesUsd / tvl;
  const annualFeeYieldPct = dailyFeeYield * 365 * 100;
  const userShare = positionValueUsd / tvl;
  const estimatedDailyEarningsUsd = dailyPoolFeesUsd * userShare;
  const estimatedAnnualEarningsUsd = estimatedDailyEarningsUsd * 365;
  const volumeToTvlRatio = pool.volumeUsd1d / tvl;

  return {
    pool,
    feeRate,
    dailyPoolFeesUsd,
    annualFeeYieldPct,
    estimatedDailyEarningsUsd,
    estimatedAnnualEarningsUsd,
    volumeToTvlRatio,
  };
}

export function selectBestPool(
  pools: PoolData[],
  positionValueUsd: number = 0,
): PoolData {
  if (pools.length === 0) {
    throw new Error('No pools found. Cannot determine best pool.');
  }
  return pools.reduce((best, pool) => {
    const bestEstimate = estimatePoolFeeYield(best, positionValueUsd);
    const poolEstimate = estimatePoolFeeYield(pool, positionValueUsd);
    return poolEstimate.annualFeeYieldPct > bestEstimate.annualFeeYieldPct
      ? pool
      : best;
  });
}

export function computeTokenRatio(
  currentPrice: number,
  minPrice: number,
  maxPrice: number,
): { tokenARatio: number; tokenBRatio: number } {
  const sqrtP = Math.sqrt(currentPrice);
  const sqrtA = Math.sqrt(minPrice);
  const sqrtB = Math.sqrt(maxPrice);

  const tokenAUnits = 1 / sqrtP - 1 / sqrtB;
  const tokenBUnits = sqrtP - sqrtA;

  const tokenAValue = currentPrice * tokenAUnits;
  const tokenBValue = tokenBUnits;

  const total = tokenAValue + tokenBValue;
  if (total === 0) return { tokenARatio: 0.5, tokenBRatio: 0.5 };

  return {
    tokenARatio: tokenAValue / total,
    tokenBRatio: tokenBValue / total,
  };
}

function getTokenBalance(
  balances: TokenBalance[],
  symbol: string,
): TokenBalance | undefined {
  return balances.find((b) => b.symbol === symbol);
}

function getTokenPrice(symbol: string, prices: PriceData): number {
  switch (symbol) {
    case 'ETH':
      return prices.ethUsd;
    case 'USDC':
      return prices.usdcUsd;
    case 'USDT':
      return prices.usdtUsd;
    default:
      return 0;
  }
}

export function computeSwapRecommendation(
  pool: PoolData,
  balances: TokenBalance[],
  prices: PriceData,
  rangePercent: number = RANGE_PERCENT,
): SwapRecommendation {
  const tokenA = pool.pair.tokenA;
  const tokenB = pool.pair.tokenB;

  const priceA = getTokenPrice(tokenA.symbol, prices);
  const priceB = getTokenPrice(tokenB.symbol, prices);

  const currentPrice = priceA / priceB;
  const minPrice = currentPrice * (1 - rangePercent);
  const maxPrice = currentPrice * (1 + rangePercent);

  const { tokenARatio, tokenBRatio } = computeTokenRatio(
    currentPrice,
    minPrice,
    maxPrice,
  );

  const totalValue = balances.reduce((sum, b) => sum + b.valueUsd, 0);

  if (totalValue === 0) {
    return {
      needed: false,
      sellToken: tokenA,
      buyToken: tokenB,
      sellAmount: 0,
      sellAmountFormatted: '0',
    };
  }

  const targetValueA = totalValue * tokenARatio;
  const targetValueB = totalValue * tokenBRatio;

  const balA = getTokenBalance(balances, tokenA.symbol);
  const balB = getTokenBalance(balances, tokenB.symbol);

  const currentValueA = (balA ? parseFloat(balA.formatted) : 0) * priceA;
  const currentValueB = (balB ? parseFloat(balB.formatted) : 0) * priceB;

  const poolSymbols = new Set([tokenA.symbol, tokenB.symbol]);
  const thirdTokens = balances.filter(
    (b) => !poolSymbols.has(b.symbol) && b.valueUsd > 0,
  );

  const deficitA = targetValueA - currentValueA;
  const deficitB = targetValueB - currentValueB;

  type Candidate = {
    token: (typeof tokenA);
    excessUsd: number;
  };
  const candidates: Candidate[] = [];

  if (currentValueA > targetValueA) {
    candidates.push({ token: tokenA, excessUsd: currentValueA - targetValueA });
  }
  if (currentValueB > targetValueB) {
    candidates.push({ token: tokenB, excessUsd: currentValueB - targetValueB });
  }
  for (const tb of thirdTokens) {
    const info = balances.find((b) => b.symbol === tb.symbol);
    if (info) {
      candidates.push({
        token: {
          symbol: info.symbol,
          address: info.address,
          decimals: info.decimals,
        },
        excessUsd: info.valueUsd,
      });
    }
  }

  if (
    candidates.length === 0 ||
    (Math.abs(deficitA) < 1 && Math.abs(deficitB) < 1)
  ) {
    return {
      needed: false,
      sellToken: tokenA,
      buyToken: tokenB,
      sellAmount: 0,
      sellAmountFormatted: '0',
    };
  }

  const sellCandidate = candidates.reduce((a, b) =>
    b.excessUsd > a.excessUsd ? b : a,
  );
  const buyToken = deficitA >= deficitB ? tokenA : tokenB;

  const sellPrice = getTokenPrice(sellCandidate.token.symbol, prices);
  const sellAmount = sellCandidate.excessUsd / sellPrice;

  return {
    needed: true,
    sellToken: sellCandidate.token,
    buyToken,
    sellAmount,
    sellAmountFormatted: sellAmount.toFixed(
      sellCandidate.token.decimals <= 8 ? 6 : 4,
    ),
  };
}

export function computeBestPoolResult(
  pool: PoolData,
  prices: PriceData,
  positionValueUsd: number,
  rangePercent: number = RANGE_PERCENT,
): BestPoolResult {
  const priceA = getTokenPrice(pool.pair.tokenA.symbol, prices);
  const priceB = getTokenPrice(pool.pair.tokenB.symbol, prices);
  const currentPrice = priceA / priceB;
  const minPrice = currentPrice * (1 - rangePercent);
  const maxPrice = currentPrice * (1 + rangePercent);
  const { tokenARatio, tokenBRatio } = computeTokenRatio(
    currentPrice,
    minPrice,
    maxPrice,
  );
  const feeEstimate = estimatePoolFeeYield(pool, positionValueUsd);

  return {
    pool,
    feeEstimate,
    currentPrice,
    minPrice,
    maxPrice,
    tokenARatio,
    tokenBRatio,
  };
}
