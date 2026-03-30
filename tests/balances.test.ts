import { describe, it, expect, vi } from 'vitest';
import { formatBalance, parseAddress } from '../src/balances.js';

describe('parseAddress', () => {
  it('accepts a valid 0x address', () => {
    const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    expect(parseAddress(addr)).toBe(addr);
  });

  it('rejects invalid address', () => {
    expect(() => parseAddress('not-an-address')).toThrow();
  });

  it('rejects address with wrong length', () => {
    expect(() => parseAddress('0x1234')).toThrow();
  });
});

describe('formatBalance', () => {
  it('formats wei to ETH (18 decimals)', () => {
    const result = formatBalance(1_500_000_000_000_000_000n, 18);
    expect(result).toBe('1.5');
  });

  it('formats USDC (6 decimals)', () => {
    const result = formatBalance(1_500_000n, 6);
    expect(result).toBe('1.5');
  });

  it('formats zero', () => {
    const result = formatBalance(0n, 18);
    expect(result).toBe('0.0');
  });
});
