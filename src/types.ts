export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

export interface PoolPair {
  label: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
}

export interface TokenBalance {
  symbol: string;
  address: string;
  balance: bigint;
  decimals: number;
  formatted: string;
  valueUsd: number;
}

export interface PoolData {
  pair: PoolPair;
  project: string; // "uniswap-v3" | "uniswap-v4"
  version: 'v3' | 'v4';
  apy: number;
  apyBase: number;
  tvlUsd: number;
  volumeUsd1d: number;
  volumeUsd7d: number;
  feeTier: number; // e.g. 3000
  tickSpacing: number; // e.g. 60
  defiLlamaSymbol: string;
}

export interface PriceData {
  ethUsd: number;
  usdcUsd: number;
  usdtUsd: number;
}

export interface PoolFeeEstimate {
  pool: PoolData;
  feeRate: number;                  // e.g. 0.0005 for 0.05%
  dailyPoolFeesUsd: number;        // total fees collected by pool per day
  annualFeeYieldPct: number;       // DefiLlama apyBase (fees) or apy fallback
  estimatedDailyEarningsUsd: number;  // positionValueUsd × apy / 365
  estimatedAnnualEarningsUsd: number;
  volumeToTvlRatio: number;        // daily volume / TVL — liquidity efficiency
}

export interface BestPoolResult {
  pool: PoolData;
  feeEstimate: PoolFeeEstimate;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  tokenARatio: number;
  tokenBRatio: number;
}

export interface SwapRecommendation {
  needed: boolean;
  sellToken: TokenInfo;
  buyToken: TokenInfo;
  sellAmount: number;
  sellAmountFormatted: string;
}

export interface AppConfig {
  rpcUrl: string;
}
