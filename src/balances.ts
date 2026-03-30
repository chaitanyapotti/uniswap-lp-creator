import { createPublicClient, http, formatUnits, getAddress, isAddress } from 'viem';
import { mainnet } from 'viem/chains';
import type { TokenBalance } from './types.js';
import { TOKENS } from './config.js';

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
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
  if (!str.includes('.')) return str + '.0';
  return str;
}

export async function fetchBalances(
  userAddress: `0x${string}`,
  rpcUrl: string,
): Promise<TokenBalance[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  const ethBalance = await client.getBalance({ address: userAddress });

  const [usdcBalance, usdtBalance] = await Promise.all([
    client.readContract({
      address: TOKENS.USDC as `0x${string}`,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    }),
    client.readContract({
      address: TOKENS.USDT as `0x${string}`,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    }),
  ]);

  return [
    {
      symbol: 'ETH',
      address: 'NATIVE',
      balance: ethBalance,
      decimals: 18,
      formatted: formatBalance(ethBalance, 18),
      valueUsd: 0,
    },
    {
      symbol: 'USDC',
      address: TOKENS.USDC,
      balance: usdcBalance,
      decimals: 6,
      formatted: formatBalance(usdcBalance, 6),
      valueUsd: 0,
    },
    {
      symbol: 'USDT',
      address: TOKENS.USDT,
      balance: usdtBalance,
      decimals: 6,
      formatted: formatBalance(usdtBalance, 6),
      valueUsd: 0,
    },
  ];
}
