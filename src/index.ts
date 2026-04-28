import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { execFile } from "node:child_process";
import { platform } from "node:os";
import { getConfig } from "./config.js";
import { parseAddress, fetchBalances } from "./balances.js";
import { fetchPoolData, fetchPrices } from "./pools.js";
import { selectBestPool, computeBestPoolResult, computeSwapRecommendation, estimatePoolFeeYield } from "./strategy.js";
import { buildCowSwapUrl, buildUniswapLpUrl } from "./urls.js";
import type { PriceData, TokenBalance } from "./types.js";

function openUrl(url: string): void {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  execFile(cmd, [url]);
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

  const poolEstimates = [...pools]
    .map((p) => ({ pool: p, estimate: estimatePoolFeeYield(p, totalValue) }))
    .sort((a, b) => b.estimate.annualFeeYieldPct - a.estimate.annualFeeYieldPct);

  printTable(
    "Top Pools by APY (DefiLlama)",
    poolEstimates
      .slice(0, 6)
      .map(({ pool: p, estimate: e }) => [
        `${p.pair.label} (${p.version}, ${(p.feeTier / 10000).toFixed(2)}%)`,
        `APY: ${e.annualFeeYieldPct.toFixed(2)}%  TVL: $${(p.tvlUsd / 1e6).toFixed(2)}M  24h Vol: $${(p.volumeUsd1d / 1e6).toFixed(1)}M  Vol/TVL: ${e.volumeToTvlRatio.toFixed(2)}`,
      ]),
  );

  const bestPool = selectBestPool(pools, totalValue);
  const bestResult = computeBestPoolResult(bestPool, prices, totalValue);
  const fe = bestResult.feeEstimate;

  printTable("Selected Pool", [
    ["Pair", bestPool.pair.label],
    ["Version", bestPool.version],
    ["Fee Tier", `${(bestPool.feeTier / 10000).toFixed(2)}%`],
    ["TVL", `$${(bestPool.tvlUsd / 1e6).toFixed(2)}M`],
    ["24h Volume", `$${(bestPool.volumeUsd1d / 1e6).toFixed(1)}M`],
    ["Vol/TVL", fe.volumeToTvlRatio.toFixed(2)],
    ["Pool Daily Fees", `$${fe.dailyPoolFeesUsd.toFixed(0)}`],
    ["DefiLlama APY", `${fe.annualFeeYieldPct.toFixed(2)}%${bestPool.apyBase > 0 ? " (apyBase)" : " (apy)"}`],
    ["Your Est. Daily", `$${fe.estimatedDailyEarningsUsd.toFixed(2)}`],
    ["Your Est. Annual", `$${fe.estimatedAnnualEarningsUsd.toFixed(2)}`],
    ["Price Range", `${bestResult.minPrice.toFixed(4)} — ${bestResult.maxPrice.toFixed(4)}`],
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
