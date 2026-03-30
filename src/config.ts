import 'dotenv/config';
import type { TokenInfo, PoolPair, AppConfig } from './types.js';

export const TOKENS: Record<string, string> = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
};

export const TOKEN_INFO: Record<string, TokenInfo> = {
  ETH: { symbol: 'ETH', address: 'NATIVE', decimals: 18 },
  USDC: { symbol: 'USDC', address: TOKENS.USDC, decimals: 6 },
  USDT: { symbol: 'USDT', address: TOKENS.USDT, decimals: 6 },
};

export const POOL_PAIRS: PoolPair[] = [
  { label: 'ETH/USDC', tokenA: TOKEN_INFO.ETH, tokenB: TOKEN_INFO.USDC },
  { label: 'ETH/USDT', tokenA: TOKEN_INFO.ETH, tokenB: TOKEN_INFO.USDT },
  { label: 'USDC/USDT', tokenA: TOKEN_INFO.USDC, tokenB: TOKEN_INFO.USDT },
];

export const CHAIN_ID = 1;
export const RANGE_PERCENT = 0.1;

export function getConfig(): AppConfig {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC_URL environment variable is required. See .env.example');
  }
  return { rpcUrl };
}
