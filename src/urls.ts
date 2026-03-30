import type { SwapRecommendation, BestPoolResult } from './types.js';

function cowTokenId(token: { symbol: string; address: string }): string {
  if (token.address === 'NATIVE' || token.symbol === 'ETH') return 'ETH';
  return token.address;
}

export function buildCowSwapUrl(rec: SwapRecommendation): string {
  const sell = cowTokenId(rec.sellToken);
  const buy = cowTokenId(rec.buyToken);
  const amount = rec.sellAmount;

  return `https://swap.cow.fi/#/1/swap/${sell}/${buy}?sellAmount=${amount}`;
}

function encodeJsonParam(obj: Record<string, unknown>): string {
  return JSON.stringify(obj).replace(/"/g, '%22');
}

function uniswapCurrency(token: { symbol: string; address: string }): string {
  if (token.address === 'NATIVE' || token.symbol === 'ETH') return 'NATIVE';
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
    initialPrice: '',
    inputMode: 'price',
  });

  const params = new URLSearchParams();
  params.set('currencyA', currencyA);
  params.set('currencyB', currencyB);
  params.set('chain', 'ethereum');
  params.set('step', '1');

  const base = `https://app.uniswap.org/positions/create?${params.toString()}`;
  return `${base}&fee=${fee}&priceRangeState=${priceRangeState}`;
}
