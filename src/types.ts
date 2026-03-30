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

export interface BestPoolResult {
  pool: PoolData;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  tokenARatio: number; // fraction of total value as tokenA (0-1)
  tokenBRatio: number; // fraction of total value as tokenB (0-1)
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
