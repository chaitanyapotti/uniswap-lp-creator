# Uniswap LP Creator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI that checks a user's ETH/USDC/USDT balances, finds the highest-APR Uniswap pool (v3 or v4), generates a CowSwap URL for the required pre-swap, and then generates a Uniswap position creation URL for a ±10% concentrated liquidity position.

**Architecture:** CLI flow — prompt for address → fetch balances via RPC → query DefiLlama for pool APYs and DexScreener for prices → select highest-APR pool → compute what swap is needed to hold both pool tokens in the correct ratio → open CowSwap URL → open Uniswap position URL. Pure TypeScript, no smart-contract interaction beyond balance reads.

**Tech Stack:** TypeScript, `viem` (RPC calls), `dotenv` (env config), `vitest` (testing), Node 20+ built-in `fetch`.

---

## Token Addresses (Ethereum Mainnet)

| Token | Address                                      |
| ----- | -------------------------------------------- |
| WETH  | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDC  | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT  | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |

## Pool Pairs to Compare

| Pair      | Tokens        |
| --------- | ------------- |
| ETH/USDC  | NATIVE + USDC |
| ETH/USDT  | NATIVE + USDT |
| USDC/USDT | USDC + USDT   |

Each pair is checked across both `uniswap-v3` and `uniswap-v4` on DefiLlama.

## File Structure

```
uniswap-lp-creator/
├── .env.example
├── .gitignore
├── tsconfig.json
├── package.json
├── src/
│   ├── index.ts          ← CLI entry point, orchestrates full flow
│   ├── config.ts         ← Token addresses, chain constants, env loading
│   ├── types.ts          ← Shared type definitions
│   ├── balances.ts       ← Read ETH + ERC-20 balances via RPC
│   ├── pools.ts          ← Fetch pool APYs (DefiLlama) and prices (DexScreener)
│   ├── strategy.ts       ← Pick best pool, compute swap amounts + token ratio
│   └── urls.ts           ← Build CowSwap swap URL and Uniswap LP URL
└── tests/
    ├── config.test.ts
    ├── balances.test.ts
    ├── pools.test.ts
    ├── strategy.test.ts
    └── urls.test.ts
```

---

## Task 1: Project Scaffolding

**Files:**

- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`

- [ ] **Step 1: Install dependencies**

```bash
npm install viem dotenv
npm install -D typescript vitest @types/node tsx
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "ES2024",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `.env.example`**

```env
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

- [ ] **Step 4: Update `package.json` scripts**

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```gitignore
node_modules/
dist/
.env
```

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold project with typescript, viem, vitest"
```

---

## Task 2: Types and Config

**Files:**

- Create: `src/types.ts`
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test for config**

```typescript
// tests/config.test.ts
import { describe, it, expect } from "vitest";
import { TOKENS, POOL_PAIRS, getConfig } from "../src/config.js";

describe("config", () => {
  it("TOKENS has ETH, USDC, USDT with valid addresses", () => {
    expect(TOKENS.WETH).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(TOKENS.USDC).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(TOKENS.USDT).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("POOL_PAIRS has 3 entries for ETH/USDC, ETH/USDT, USDC/USDT", () => {
    expect(POOL_PAIRS).toHaveLength(3);
    const labels = POOL_PAIRS.map((p) => p.label);
    expect(labels).toContain("ETH/USDC");
    expect(labels).toContain("ETH/USDT");
    expect(labels).toContain("USDC/USDT");
  });

  it("getConfig reads RPC_URL from env", () => {
    process.env.RPC_URL = "https://example.com/rpc";
    const cfg = getConfig();
    expect(cfg.rpcUrl).toBe("https://example.com/rpc");
    delete process.env.RPC_URL;
  });

  it("getConfig throws when RPC_URL is missing", () => {
    delete process.env.RPC_URL;
    expect(() => getConfig()).toThrow("RPC_URL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/types.ts`**

```typescript
// src/types.ts

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
  version: "v3" | "v4";
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
```

- [ ] **Step 4: Create `src/config.ts`**

```typescript
// src/config.ts
import "dotenv/config";
import type { TokenInfo, PoolPair, AppConfig } from "./types.js";

export const TOKENS: Record<string, string> = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
};

export const TOKEN_INFO: Record<string, TokenInfo> = {
  ETH: { symbol: "ETH", address: "NATIVE", decimals: 18 },
  USDC: { symbol: "USDC", address: TOKENS.USDC, decimals: 6 },
  USDT: { symbol: "USDT", address: TOKENS.USDT, decimals: 6 },
};

export const POOL_PAIRS: PoolPair[] = [
  { label: "ETH/USDC", tokenA: TOKEN_INFO.ETH, tokenB: TOKEN_INFO.USDC },
  { label: "ETH/USDT", tokenA: TOKEN_INFO.ETH, tokenB: TOKEN_INFO.USDT },
  { label: "USDC/USDT", tokenA: TOKEN_INFO.USDC, tokenB: TOKEN_INFO.USDT },
];

export const CHAIN_ID = 1;
export const RANGE_PERCENT = 0.1;

export function getConfig(): AppConfig {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error("RPC_URL environment variable is required. See .env.example");
  }
  return { rpcUrl };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/config.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts tests/config.test.ts
git commit -m "feat: add type definitions and config module"
```

---

## Task 3: Balance Fetching

**Files:**

- Create: `src/balances.ts`
- Create: `tests/balances.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/balances.test.ts
import { describe, it, expect, vi } from "vitest";
import { formatBalance, parseAddress } from "../src/balances.js";

describe("parseAddress", () => {
  it("accepts a valid 0x address", () => {
    const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    expect(parseAddress(addr)).toBe(addr);
  });

  it("rejects invalid address", () => {
    expect(() => parseAddress("not-an-address")).toThrow();
  });

  it("rejects address with wrong length", () => {
    expect(() => parseAddress("0x1234")).toThrow();
  });
});

describe("formatBalance", () => {
  it("formats wei to ETH (18 decimals)", () => {
    const result = formatBalance(1_500_000_000_000_000_000n, 18);
    expect(result).toBe("1.5");
  });

  it("formats USDC (6 decimals)", () => {
    const result = formatBalance(1_500_000n, 6);
    expect(result).toBe("1.5");
  });

  it("formats zero", () => {
    const result = formatBalance(0n, 18);
    expect(result).toBe("0.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/balances.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/balances.ts`**

```typescript
// src/balances.ts
import { createPublicClient, http, formatUnits, getAddress, isAddress } from "viem";
import { mainnet } from "viem/chains";
import type { TokenBalance } from "./types.js";
import { TOKEN_INFO, TOKENS } from "./config.js";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

export function parseAddress(input: string): `0x${string}` {
  if (!isAddress(input)) {
    throw new Error(`Invalid Ethereum address: ${input}`);
  }
  return getAddress(input);
}

export function formatBalance(raw: bigint, decimals: number): string {
  const str = formatUnits(raw, decimals);
  if (!str.includes(".")) return str + ".0";
  return str;
}

export async function fetchBalances(userAddress: `0x${string}`, rpcUrl: string): Promise<TokenBalance[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  const ethBalance = await client.getBalance({ address: userAddress });

  const [usdcBalance, usdtBalance] = await Promise.all([
    client.readContract({
      address: TOKENS.USDC as `0x${string}`,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    }),
    client.readContract({
      address: TOKENS.USDT as `0x${string}`,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    }),
  ]);

  return [
    {
      symbol: "ETH",
      address: "NATIVE",
      balance: ethBalance,
      decimals: 18,
      formatted: formatBalance(ethBalance, 18),
      valueUsd: 0, // filled later with price data
    },
    {
      symbol: "USDC",
      address: TOKENS.USDC,
      balance: usdcBalance,
      decimals: 6,
      formatted: formatBalance(usdcBalance, 6),
      valueUsd: 0,
    },
    {
      symbol: "USDT",
      address: TOKENS.USDT,
      balance: usdtBalance,
      decimals: 6,
      formatted: formatBalance(usdtBalance, 6),
      valueUsd: 0,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/balances.test.ts
```

Expected: PASS (unit tests for `parseAddress` and `formatBalance` — no RPC calls).

- [ ] **Step 5: Commit**

```bash
git add src/balances.ts tests/balances.test.ts
git commit -m "feat: add balance fetching with address validation"
```

---

## Task 4: Pool Data Fetching

**Files:**

- Create: `src/pools.ts`
- Create: `tests/pools.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pools.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseDefiLlamaPools, parseDexScreenerPrices, FEE_TIER_MAP } from "../src/pools.js";

describe("FEE_TIER_MAP", () => {
  it("maps fee amounts to tick spacings", () => {
    expect(FEE_TIER_MAP[100]).toBe(1);
    expect(FEE_TIER_MAP[500]).toBe(10);
    expect(FEE_TIER_MAP[3000]).toBe(60);
    expect(FEE_TIER_MAP[10000]).toBe(200);
  });
});

describe("parseDefiLlamaPools", () => {
  it("parses DefiLlama response into PoolData array", () => {
    const raw = [
      {
        pool: "abc-123",
        project: "uniswap-v3",
        chain: "Ethereum",
        symbol: "USDC-WETH",
        tvlUsd: 15_000_000,
        apy: 12.5,
        apyBase: 10.2,
        volumeUsd1d: 2_100_000,
        volumeUsd7d: 14_800_000,
      },
    ];
    const result = parseDefiLlamaPools(raw);
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe("v3");
    expect(result[0].apy).toBe(12.5);
    expect(result[0].tvlUsd).toBe(15_000_000);
  });

  it("detects v4 pools", () => {
    const raw = [
      {
        pool: "xyz-456",
        project: "uniswap-v4",
        chain: "Ethereum",
        symbol: "USDC-WETH",
        tvlUsd: 5_000_000,
        apy: 18.0,
        apyBase: 15.0,
        volumeUsd1d: 1_000_000,
        volumeUsd7d: 7_000_000,
      },
    ];
    const result = parseDefiLlamaPools(raw);
    expect(result[0].version).toBe("v4");
  });

  it("returns empty array for empty input", () => {
    expect(parseDefiLlamaPools([])).toEqual([]);
  });
});

describe("parseDexScreenerPrices", () => {
  it("extracts ETH price from DexScreener response", () => {
    const raw = [
      {
        dexId: "uniswap",
        baseToken: { symbol: "WETH", priceUsd: "1900.50" },
        quoteToken: { symbol: "USDC", priceUsd: "1.00" },
      },
    ];
    const prices = parseDexScreenerPrices(raw);
    expect(prices.ethUsd).toBeCloseTo(1900.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/pools.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/pools.ts`**

```typescript
// src/pools.ts
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
      ethUsd = parseFloat(pair.baseToken.priceUsd);
    }
    if (quote === "WETH" || quote === "ETH") {
      ethUsd = parseFloat(pair.quoteToken.priceUsd);
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/pools.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pools.ts tests/pools.test.ts
git commit -m "feat: add pool data and price fetching from DefiLlama/DexScreener"
```

---

## Task 5: Strategy — Best Pool Selection and Swap Calculation

**Files:**

- Create: `src/strategy.ts`
- Create: `tests/strategy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/strategy.test.ts
import { describe, it, expect } from "vitest";
import { selectBestPool, computeTokenRatio, computeSwapRecommendation } from "../src/strategy.js";
import type { PoolData, TokenBalance, PriceData } from "../src/types.js";
import { TOKEN_INFO } from "../src/config.js";

const makePool = (label: string, apy: number, version: "v3" | "v4" = "v3"): PoolData => ({
  pair: {
    label,
    tokenA: label.startsWith("ETH") ? TOKEN_INFO.ETH : TOKEN_INFO.USDC,
    tokenB: label.endsWith("USDC") ? TOKEN_INFO.USDC : label.endsWith("USDT") ? TOKEN_INFO.USDT : TOKEN_INFO.USDT,
  },
  project: `uniswap-${version}`,
  version,
  apy,
  apyBase: apy * 0.8,
  tvlUsd: 10_000_000,
  volumeUsd1d: 1_000_000,
  volumeUsd7d: 7_000_000,
  feeTier: 3000,
  tickSpacing: 60,
  defiLlamaSymbol: `WETH-USDC`,
});

describe("selectBestPool", () => {
  it("picks the pool with the highest APY", () => {
    const pools = [makePool("ETH/USDC", 8.0), makePool("ETH/USDT", 15.0), makePool("USDC/USDT", 5.0)];
    const best = selectBestPool(pools);
    expect(best.pair.label).toBe("ETH/USDT");
    expect(best.apy).toBe(15.0);
  });

  it("throws when no pools available", () => {
    expect(() => selectBestPool([])).toThrow();
  });
});

describe("computeTokenRatio", () => {
  it("returns ~50/50 for price at midpoint of range (stablecoin pair)", () => {
    // USDC/USDT at price 1.0, range [0.9, 1.1]
    const ratio = computeTokenRatio(1.0, 0.9, 1.1);
    expect(ratio.tokenARatio).toBeCloseTo(0.5, 1);
    expect(ratio.tokenBRatio).toBeCloseTo(0.5, 1);
  });

  it("ratios sum to 1", () => {
    const ratio = computeTokenRatio(2000, 1800, 2200);
    expect(ratio.tokenARatio + ratio.tokenBRatio).toBeCloseTo(1.0);
  });

  it("tokenB ratio increases when price is near max", () => {
    const mid = computeTokenRatio(2000, 1800, 2200);
    const high = computeTokenRatio(2150, 1800, 2200);
    expect(high.tokenBRatio).toBeGreaterThan(mid.tokenBRatio);
  });
});

describe("computeSwapRecommendation", () => {
  const prices: PriceData = { ethUsd: 2000, usdcUsd: 1, usdtUsd: 1 };

  it("recommends swap when user has only ETH and needs ETH/USDC", () => {
    const balances: TokenBalance[] = [
      { symbol: "ETH", address: "NATIVE", balance: 10n * 10n ** 18n, decimals: 18, formatted: "10.0", valueUsd: 20000 },
      { symbol: "USDC", address: "0x...", balance: 0n, decimals: 6, formatted: "0.0", valueUsd: 0 },
      { symbol: "USDT", address: "0x...", balance: 0n, decimals: 6, formatted: "0.0", valueUsd: 0 },
    ];
    const pool = makePool("ETH/USDC", 12);
    const rec = computeSwapRecommendation(pool, balances, prices, 0.1);
    expect(rec.needed).toBe(true);
    expect(rec.sellToken.symbol).toBe("ETH");
    expect(rec.buyToken.symbol).toBe("USDC");
    expect(rec.sellAmount).toBeGreaterThan(0);
  });

  it("recommends no swap when user has exact ratio", () => {
    const balances: TokenBalance[] = [
      { symbol: "ETH", address: "NATIVE", balance: 5n * 10n ** 18n, decimals: 18, formatted: "5.0", valueUsd: 10000 },
      { symbol: "USDC", address: "0x...", balance: 10_000_000_000n, decimals: 6, formatted: "10000.0", valueUsd: 10000 },
      { symbol: "USDT", address: "0x...", balance: 0n, decimals: 6, formatted: "0.0", valueUsd: 0 },
    ];
    const pool = makePool("ETH/USDC", 12);
    const rec = computeSwapRecommendation(pool, balances, prices, 0.1);
    expect(rec.sellAmount).toBeLessThan(5);
  });

  it("recommends swap when user only holds a third token not in the pool", () => {
    // User has only USDT but best pool is ETH/USDC
    const balances: TokenBalance[] = [
      { symbol: "ETH", address: "NATIVE", balance: 0n, decimals: 18, formatted: "0.0", valueUsd: 0 },
      { symbol: "USDC", address: "0x...", balance: 0n, decimals: 6, formatted: "0.0", valueUsd: 0 },
      { symbol: "USDT", address: "0x...", balance: 5_000_000_000n, decimals: 6, formatted: "5000.0", valueUsd: 5000 },
    ];
    const pool = makePool("ETH/USDC", 12);
    const rec = computeSwapRecommendation(pool, balances, prices, 0.1);
    expect(rec.needed).toBe(true);
    expect(rec.sellToken.symbol).toBe("USDT");
    expect(rec.sellAmount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/strategy.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/strategy.ts`**

The key math for concentrated liquidity token ratio:

For a position in a pool with current price `p`, range `[pA, pB]` (where price is quoted as tokenB per tokenA):

- Amount of tokenA needed: proportional to `(1/sqrt(p) - 1/sqrt(pB))`
- Amount of tokenB needed: proportional to `(sqrt(p) - sqrt(pA))`
- Value ratio (in USD): `tokenA_value_fraction = p * (1/sqrt(p) - 1/sqrt(pB)) / [p * (1/sqrt(p) - 1/sqrt(pB)) + (sqrt(p) - sqrt(pA))]`

```typescript
// src/strategy.ts
import type { PoolData, TokenBalance, PriceData, BestPoolResult, SwapRecommendation } from "./types.js";
import { RANGE_PERCENT } from "./config.js";

export function selectBestPool(pools: PoolData[]): PoolData {
  if (pools.length === 0) {
    throw new Error("No pools found. Cannot determine best pool.");
  }
  return pools.reduce((best, pool) => (pool.apy > best.apy ? pool : best));
}

export function computeTokenRatio(currentPrice: number, minPrice: number, maxPrice: number): { tokenARatio: number; tokenBRatio: number } {
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

function getTokenBalance(balances: TokenBalance[], symbol: string): TokenBalance | undefined {
  return balances.find((b) => b.symbol === symbol);
}

function getTokenPrice(symbol: string, prices: PriceData): number {
  switch (symbol) {
    case "ETH":
      return prices.ethUsd;
    case "USDC":
      return prices.usdcUsd;
    case "USDT":
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

  const { tokenARatio, tokenBRatio } = computeTokenRatio(currentPrice, minPrice, maxPrice);

  // Use TOTAL portfolio value across all tokens (ETH + USDC + USDT),
  // not just the two pool tokens. This handles the case where the user
  // holds only a third token (e.g. USDT) but the best pool is ETH/USDC.
  const totalValue = balances.reduce((sum, b) => sum + b.valueUsd, 0);

  if (totalValue === 0) {
    return {
      needed: false,
      sellToken: tokenA,
      buyToken: tokenB,
      sellAmount: 0,
      sellAmountFormatted: "0",
    };
  }

  const targetValueA = totalValue * tokenARatio;
  const targetValueB = totalValue * tokenBRatio;

  const balA = getTokenBalance(balances, tokenA.symbol);
  const balB = getTokenBalance(balances, tokenB.symbol);

  const currentValueA = (balA ? parseFloat(balA.formatted) : 0) * priceA;
  const currentValueB = (balB ? parseFloat(balB.formatted) : 0) * priceB;

  // Find which third token(s) the user holds that are NOT in the pool
  const poolSymbols = new Set([tokenA.symbol, tokenB.symbol]);
  const thirdTokens = balances.filter((b) => !poolSymbols.has(b.symbol) && b.valueUsd > 0);

  // Determine which pool token the user is shortest on (needs buying),
  // and which they should sell. Also sell any third-token holdings.
  const deficitA = targetValueA - currentValueA; // positive = need more A
  const deficitB = targetValueB - currentValueB; // positive = need more B

  // Total amount to sell: the larger deficit tells us what to buy,
  // the user sells any excess pool token + all third-token value.
  // For simplicity, produce a SINGLE swap recommendation:
  //   - Sell the token with greatest excess (pool token or third token)
  //   - Buy the pool token with greatest deficit

  // Build a list of candidate sell tokens with their excess value
  type Candidate = { token: typeof tokenA; excessUsd: number };
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
        token: { symbol: info.symbol, address: info.address, decimals: info.decimals },
        excessUsd: info.valueUsd,
      });
    }
  }

  if (candidates.length === 0 || (Math.abs(deficitA) < 1 && Math.abs(deficitB) < 1)) {
    return {
      needed: false,
      sellToken: tokenA,
      buyToken: tokenB,
      sellAmount: 0,
      sellAmountFormatted: "0",
    };
  }

  // Sell the largest-excess token, buy the most-needed pool token
  const sellCandidate = candidates.reduce((a, b) => (b.excessUsd > a.excessUsd ? b : a));
  const buyToken = deficitA >= deficitB ? tokenA : tokenB;

  const sellPrice = getTokenPrice(sellCandidate.token.symbol, prices);
  const sellAmount = sellCandidate.excessUsd / sellPrice;

  return {
    needed: true,
    sellToken: sellCandidate.token,
    buyToken,
    sellAmount,
    sellAmountFormatted: sellAmount.toFixed(sellCandidate.token.decimals <= 8 ? 6 : 4),
  };
}

export function computeBestPoolResult(pool: PoolData, prices: PriceData, rangePercent: number = RANGE_PERCENT): BestPoolResult {
  const priceA = getTokenPrice(pool.pair.tokenA.symbol, prices);
  const priceB = getTokenPrice(pool.pair.tokenB.symbol, prices);
  const currentPrice = priceA / priceB;
  const minPrice = currentPrice * (1 - rangePercent);
  const maxPrice = currentPrice * (1 + rangePercent);
  const { tokenARatio, tokenBRatio } = computeTokenRatio(currentPrice, minPrice, maxPrice);

  return { pool, currentPrice, minPrice, maxPrice, tokenARatio, tokenBRatio };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/strategy.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/strategy.ts tests/strategy.test.ts
git commit -m "feat: add pool selection and swap amount strategy"
```

---

## Task 6: URL Generation — CowSwap and Uniswap Deep Links

**Files:**

- Create: `src/urls.ts`
- Create: `tests/urls.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/urls.test.ts
import { describe, it, expect } from "vitest";
import { buildCowSwapUrl, buildUniswapLpUrl } from "../src/urls.js";
import { TOKEN_INFO } from "../src/config.js";
import type { SwapRecommendation, BestPoolResult, PoolData } from "../src/types.js";

describe("buildCowSwapUrl", () => {
  it("builds correct CowSwap URL for ETH → USDC swap", () => {
    const rec: SwapRecommendation = {
      needed: true,
      sellToken: TOKEN_INFO.ETH,
      buyToken: TOKEN_INFO.USDC,
      sellAmount: 2.5,
      sellAmountFormatted: "2.500000",
    };
    const url = buildCowSwapUrl(rec);
    expect(url).toContain("swap.cow.fi");
    expect(url).toContain("/1/swap/");
    expect(url).toContain("ETH");
    expect(url).toContain("sellAmount=2.5");
  });

  it("uses token addresses for non-native tokens", () => {
    const rec: SwapRecommendation = {
      needed: true,
      sellToken: TOKEN_INFO.USDC,
      buyToken: TOKEN_INFO.USDT,
      sellAmount: 1000,
      sellAmountFormatted: "1000.000000",
    };
    const url = buildCowSwapUrl(rec);
    expect(url).toContain(TOKEN_INFO.USDC.address);
    expect(url).toContain(TOKEN_INFO.USDT.address);
  });
});

describe("buildUniswapLpUrl", () => {
  const makePoolResult = (): BestPoolResult => {
    const pool: PoolData = {
      pair: {
        label: "ETH/USDC",
        tokenA: TOKEN_INFO.ETH,
        tokenB: TOKEN_INFO.USDC,
      },
      project: "uniswap-v3",
      version: "v3",
      apy: 12,
      apyBase: 10,
      tvlUsd: 15_000_000,
      volumeUsd1d: 2_000_000,
      volumeUsd7d: 14_000_000,
      feeTier: 3000,
      tickSpacing: 60,
      defiLlamaSymbol: "WETH-USDC",
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

  it("builds correct Uniswap LP URL", () => {
    const url = buildUniswapLpUrl(makePoolResult());
    expect(url).toContain("app.uniswap.org/positions/create");
    expect(url).toContain("chain=ethereum");
    expect(url).toContain("currencyA=NATIVE");
    expect(url).toContain(TOKEN_INFO.USDC.address);
  });

  it("includes price range state with min and max prices", () => {
    const url = buildUniswapLpUrl(makePoolResult());
    expect(url).toContain("1800");
    expect(url).toContain("2200");
    expect(url).toContain("fullRange");
  });

  it("includes fee configuration", () => {
    const url = buildUniswapLpUrl(makePoolResult());
    expect(url).toContain("feeAmount");
    expect(url).toContain("3000");
    expect(url).toContain("tickSpacing");
    expect(url).toContain("60");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/urls.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/urls.ts`**

```typescript
// src/urls.ts
import type { SwapRecommendation, BestPoolResult } from "./types.js";

function cowTokenId(token: { symbol: string; address: string }): string {
  if (token.address === "NATIVE" || token.symbol === "ETH") return "ETH";
  return token.address;
}

export function buildCowSwapUrl(rec: SwapRecommendation): string {
  const sell = cowTokenId(rec.sellToken);
  const buy = cowTokenId(rec.buyToken);
  const amount = rec.sellAmount;

  return `https://swap.cow.fi/#/1/swap/${sell}/${buy}?sellAmount=${amount}`;
}

function encodeJsonParam(obj: Record<string, any>): string {
  return JSON.stringify(obj).replace(/"/g, "%22");
}

function uniswapCurrency(token: { symbol: string; address: string }): string {
  if (token.address === "NATIVE" || token.symbol === "ETH") return "NATIVE";
  return token.address;
}

export function buildUniswapLpUrl(result: BestPoolResult): string {
  const { pool, minPrice, maxPrice } = result;

  const currencyA = uniswapCurrency(pool.pair.tokenA);
  const currencyB = uniswapCurrency(pool.pair.tokenB);

  const fee = encodeJsonParam({
    feeAmount: pool.feeTier,
    tickSpacing: pool.tickSpacing,
    isDynamic: false,
  });

  const priceRangeState = encodeJsonParam({
    priceInverted: false,
    fullRange: false,
    minPrice: minPrice.toFixed(2),
    maxPrice: maxPrice.toFixed(2),
    initialPrice: "",
    inputMode: "price",
  });

  const params = new URLSearchParams();
  params.set("currencyA", currencyA);
  params.set("currencyB", currencyB);
  params.set("chain", "ethereum");
  params.set("step", "1");

  const base = `https://app.uniswap.org/positions/create?${params.toString()}`;
  return `${base}&fee=${fee}&priceRangeState=${priceRangeState}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/urls.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/urls.ts tests/urls.test.ts
git commit -m "feat: add CowSwap and Uniswap deep link URL builders"
```

---

## Task 7: CLI Entry Point

**Files:**

- Create: `src/index.ts`

- [ ] **Step 1: Write `src/index.ts`**

This is the orchestration file that ties everything together. No separate test file — this is integration-tested by running the CLI.

```typescript
// src/index.ts
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { exec } from "node:child_process";
import { platform } from "node:os";
import { getConfig } from "./config.js";
import { parseAddress, fetchBalances, formatBalance } from "./balances.js";
import { fetchPoolData, fetchPrices } from "./pools.js";
import { selectBestPool, computeBestPoolResult, computeSwapRecommendation } from "./strategy.js";
import { buildCowSwapUrl, buildUniswapLpUrl } from "./urls.js";
import type { PriceData, TokenBalance } from "./types.js";

function openUrl(url: string): void {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`);
}

function fillValueUsd(balances: TokenBalance[], prices: PriceData): void {
  for (const b of balances) {
    const price = b.symbol === "ETH" ? prices.ethUsd : b.symbol === "USDC" ? prices.usdcUsd : prices.usdtUsd;
    b.valueUsd = parseFloat(b.formatted) * price;
  }
}

function printTable(title: string, rows: Array<[string, string]>): void {
  console.log(`\n=== ${title} ===`);
  const maxKey = Math.max(...rows.map(([k]) => k.length));
  for (const [key, value] of rows) {
    console.log(`  ${key.padEnd(maxKey + 2)}${value}`);
  }
}

async function main(): Promise<void> {
  const config = getConfig();

  const rl = readline.createInterface({ input: stdin, output: stdout });

  let address: `0x${string}`;
  try {
    const raw = await rl.question("Enter your Ethereum address: ");
    address = parseAddress(raw.trim());
  } finally {
    rl.close();
  }

  console.log(`\nFetching data for ${address}...\n`);

  const [balances, pools, prices] = await Promise.all([fetchBalances(address, config.rpcUrl), fetchPoolData(), fetchPrices()]);

  fillValueUsd(balances, prices);

  printTable("Token Balances", [
    ["ETH", `${balances[0].formatted} ($${balances[0].valueUsd.toFixed(2)})`],
    ["USDC", `${balances[1].formatted} ($${balances[1].valueUsd.toFixed(2)})`],
    ["USDT", `${balances[2].formatted} ($${balances[2].valueUsd.toFixed(2)})`],
  ]);

  const totalValue = balances.reduce((s, b) => s + b.valueUsd, 0);
  console.log(`  Total value: $${totalValue.toFixed(2)}`);

  if (totalValue === 0) {
    console.log("\nNo balance found. Nothing to do.");
    return;
  }

  console.log(`\nFound ${pools.length} pools across v3/v4...`);

  if (pools.length === 0) {
    console.log("No pool data available from DefiLlama. Try again later.");
    return;
  }

  printTable(
    "Top Pools by APY",
    pools
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 6)
      .map((p) => [
        `${p.pair.label} (${p.version}, ${(p.feeTier / 10000).toFixed(2)}%)`,
        `APY: ${p.apy.toFixed(2)}%  TVL: $${(p.tvlUsd / 1e6).toFixed(1)}M`,
      ]),
  );

  const bestPool = selectBestPool(pools);
  const bestResult = computeBestPoolResult(bestPool, prices);

  printTable("Selected Pool", [
    ["Pair", bestPool.pair.label],
    ["Version", bestPool.version],
    ["APY", `${bestPool.apy.toFixed(2)}%`],
    ["Fee Tier", `${(bestPool.feeTier / 10000).toFixed(2)}%`],
    ["TVL", `$${(bestPool.tvlUsd / 1e6).toFixed(1)}M`],
    ["Price Range", `${bestResult.minPrice.toFixed(2)} — ${bestResult.maxPrice.toFixed(2)}`],
    ["Token A Ratio", `${(bestResult.tokenARatio * 100).toFixed(1)}%`],
    ["Token B Ratio", `${(bestResult.tokenBRatio * 100).toFixed(1)}%`],
  ]);

  const swap = computeSwapRecommendation(bestPool, balances, prices);

  if (swap.needed) {
    const cowUrl = buildCowSwapUrl(swap);

    printTable("Step 1: Swap on CowSwap", [
      ["Sell", `${swap.sellAmountFormatted} ${swap.sellToken.symbol}`],
      ["Buy", swap.buyToken.symbol],
      ["URL", cowUrl],
    ]);

    console.log("\nOpening CowSwap...");
    openUrl(cowUrl);

    const rl2 = readline.createInterface({ input: stdin, output: stdout });
    await rl2.question("\nPress Enter after completing the swap to continue...");
    rl2.close();
  } else {
    console.log("\nNo swap needed — you already have the right token ratio.");
  }

  const lpUrl = buildUniswapLpUrl(bestResult);

  printTable("Step 2: Create Uniswap LP Position", [
    ["Pair", bestPool.pair.label],
    ["Version", bestPool.version],
    ["Fee", `${(bestPool.feeTier / 10000).toFixed(2)}%`],
    ["Min Price", bestResult.minPrice.toFixed(2)],
    ["Max Price", bestResult.maxPrice.toFixed(2)],
    ["URL", lpUrl],
  ]);

  console.log("\nOpening Uniswap...");
  openUrl(lpUrl);

  console.log("\nDone! Review and confirm the position in your browser.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-test the CLI**

```bash
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY npx tsx src/index.ts
```

Enter a known address (e.g., `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` — vitalik.eth) and verify:

1. Balances print correctly
2. Pool APY data loads
3. Best pool is selected
4. CowSwap URL opens (or prints)
5. Uniswap LP URL opens (or prints)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point orchestrating full LP creation flow"
```

---

## Task 8: Run All Tests and Final Cleanup

**Files:**

- Modify: `package.json` (if needed)

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and all tests passing"
```

---

## Architecture Notes for Implementer

### CowSwap URL Format

```
https://swap.cow.fi/#/1/swap/{sellToken}/{buyToken}?sellAmount={amount}
```

- Chain ID `1` = Ethereum mainnet
- For ETH use `ETH` as the token identifier
- For ERC-20 tokens use the contract address
- Only set `sellAmount` (not both sell and buy)

### Uniswap LP URL Format

```
https://app.uniswap.org/positions/create
  ?currencyA=NATIVE
  &currencyB=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
  &chain=ethereum
  &fee={%22feeAmount%22:3000,%22tickSpacing%22:60,%22isDynamic%22:false}
  &priceRangeState={%22priceInverted%22:false,%22fullRange%22:false,%22minPrice%22:%221800%22,%22maxPrice%22:%222200%22,%22initialPrice%22:%22%22,%22inputMode%22:%22price%22}
  &step=1
```

- Only encode `"` → `%22` in JSON params. Do NOT encode `{}`, `:`, or `,`.
- For ETH use `NATIVE` as currencyA/B.
- `step=1` goes directly to the create form.

### Concentrated Liquidity Token Ratio Math

For a Uniswap v3/v4 position with current price `p` and range `[pA, pB]`:

```
tokenA_amount ∝ (1/√p - 1/√pB)
tokenB_amount ∝ (√p - √pA)

tokenA_value = p × tokenA_amount
tokenB_value = tokenB_amount

tokenA_fraction = tokenA_value / (tokenA_value + tokenB_value)
```

This determines what fraction of the user's total capital should be in each token. The difference from their current holdings is the swap amount.

### API Endpoints Used

| API          | Endpoint                                                        | Purpose             |
| ------------ | --------------------------------------------------------------- | ------------------- |
| DefiLlama    | `https://yields.llama.fi/pools`                                 | Pool APY data       |
| DexScreener  | `https://api.dexscreener.com/token-pairs/v1/ethereum/{address}` | Current prices      |
| Ethereum RPC | `eth_getBalance`, `eth_call` (balanceOf)                        | User token balances |
