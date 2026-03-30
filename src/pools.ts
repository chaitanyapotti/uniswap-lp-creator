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

function inferFeeTier(symbol: string): number {
  const lower = symbol.toLowerCase();
  if (lower.includes("usdc") && lower.includes("usdt")) return 100;
  if (lower.includes("0.01")) return 100;
  if (lower.includes("0.05")) return 500;
  if (lower.includes("1.00") || lower.includes("1%")) return 10000;
  return 3000;
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
}

export function parseDefiLlamaPools(raw: RawDefiLlamaPool[]): PoolData[] {
  return raw
    .filter((p) => p.chain === "Ethereum")
    .filter((p) => p.project === "uniswap-v3" || p.project === "uniswap-v4")
    .map((p) => {
      const pair = matchPair(p.symbol);
      if (!pair) return null;
      const version = p.project.endsWith("v4") ? "v4" : "v3";
      const feeTier = inferFeeTier(p.symbol);
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
      ethUsd = ethUsd || pair.priceUsd;
    }
    if (quote === "WETH" || quote === "ETH") {
      ethUsd = ethUsd || pair.priceUsd;
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
