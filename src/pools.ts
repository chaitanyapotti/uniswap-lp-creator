import type { PoolData, PriceData, PoolPair } from "./types.js";
import { POOL_PAIRS, TOKENS } from "./config.js";

export const FEE_TIER_MAP: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

const SYMBOL_ALIASES: Record<string, string[]> = {
  "ETH/USDC": ["WETH-USDC", "USDC-WETH", "ETH-USDC", "USDC-ETH"],
  "ETH/USDT": ["WETH-USDT", "USDT-WETH", "ETH-USDT", "USDT-ETH"],
  "USDC/USDT": ["USDC-USDT", "USDT-USDC"],
};

function matchPair(defiLlamaSymbol: string): PoolPair | undefined {
  const normalized = defiLlamaSymbol.toUpperCase();
  for (const pair of POOL_PAIRS) {
    const aliases = SYMBOL_ALIASES[pair.label];
    if (aliases?.some((a) => normalized.includes(a))) {
      return pair;
    }
  }
  return undefined;
}

const POOL_META_TO_FEE: Record<string, number> = {
  '0.01%': 100,
  '0.05%': 500,
  '0.08%': 800,
  '0.30%': 3000,
  '0.3%': 3000,
  '1%': 10000,
  '1.00%': 10000,
};

export function parsePoolMeta(poolMeta: string | null | undefined): number {
  if (!poolMeta) return 3000;
  return POOL_META_TO_FEE[poolMeta.trim()] ?? 3000;
}

export interface RawDefiLlamaPool {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  volumeUsd1d: number | null;
  volumeUsd7d: number | null;
  poolMeta: string | null;
}

export function parseDefiLlamaPools(raw: RawDefiLlamaPool[]): PoolData[] {
  return raw
    .filter((p) => p.chain === "Ethereum")
    .filter((p) => p.project === "uniswap-v3" || p.project === "uniswap-v4")
    .map((p) => {
      const pair = matchPair(p.symbol);
      if (!pair) return null;
      const version = p.project.endsWith("v4") ? "v4" : "v3";
      const feeTier = parsePoolMeta(p.poolMeta);
      return {
        pair,
        project: p.project,
        version,
        apy: p.apy ?? 0,
        apyBase: p.apyBase ?? 0,
        tvlUsd: p.tvlUsd,
        volumeUsd1d: p.volumeUsd1d ?? 0,
        volumeUsd7d: p.volumeUsd7d ?? 0,
        feeTier,
        tickSpacing: FEE_TIER_MAP[feeTier] ?? 60,
        defiLlamaSymbol: p.symbol,
      } satisfies PoolData;
    })
    .filter((p): p is PoolData => p !== null);
}

export function parseDexScreenerPrices(raw: any[]): PriceData {
  let ethUsd = 0;
  let usdcUsd = 1;
  let usdtUsd = 1;

  for (const pair of raw) {
    if (pair.dexId !== "uniswap") continue;
    const base = pair.baseToken?.symbol?.toUpperCase();
    const quote = pair.quoteToken?.symbol?.toUpperCase();

    if (base === "WETH" || base === "ETH") {
      ethUsd = parseFloat(pair.baseToken?.priceUsd || pair.priceUsd);
    }
    if (quote === "WETH" || quote === "ETH") {
      ethUsd = parseFloat(pair.quoteToken?.priceUsd || pair.priceUsd);
    }
    if (base === "USDC") usdcUsd = parseFloat(pair.baseToken.priceUsd);
    if (base === "USDT") usdtUsd = parseFloat(pair.baseToken.priceUsd);
  }

  return { ethUsd, usdcUsd, usdtUsd };
}

export async function fetchPoolData(): Promise<PoolData[]> {
  const resp = await fetch("https://yields.llama.fi/pools");
  if (!resp.ok) throw new Error(`DefiLlama API error: ${resp.status}`);
  const json = (await resp.json()) as { data: RawDefiLlamaPool[] };

  const relevant = json.data.filter(
    (p) => (p.project === "uniswap-v3" || p.project === "uniswap-v4") && p.chain === "Ethereum" && /WETH|ETH|USDC|USDT/i.test(p.symbol),
  );

  return parseDefiLlamaPools(relevant);
}

export async function fetchPrices(): Promise<PriceData> {
  const resp = await fetch(`https://api.dexscreener.com/token-pairs/v1/ethereum/${TOKENS.WETH}`);
  if (!resp.ok) throw new Error(`DexScreener API error: ${resp.status}`);
  const json = (await resp.json()) as any[];
  return parseDexScreenerPrices(json);
}
