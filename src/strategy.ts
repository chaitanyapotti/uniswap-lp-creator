import type {
  PoolData,
  TokenBalance,
  PriceData,
  BestPoolResult,
  SwapRecommendation,
} from './types.js';
import { RANGE_PERCENT } from './config.js';

export function selectBestPool(pools: PoolData[]): PoolData {
  if (pools.length === 0) {
    throw new Error('No pools found. Cannot determine best pool.');
  }
  return pools.reduce((best, pool) => (pool.apy > best.apy ? pool : best));
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

  return { pool, currentPrice, minPrice, maxPrice, tokenARatio, tokenBRatio };
}
