import { describe, it, expect } from 'vitest';
import { TOKENS, POOL_PAIRS, getConfig } from '../src/config.js';

describe('config', () => {
  it('TOKENS has ETH, USDC, USDT with valid addresses', () => {
    expect(TOKENS.WETH).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(TOKENS.USDC).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(TOKENS.USDT).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('POOL_PAIRS has 3 entries for ETH/USDC, ETH/USDT, USDC/USDT', () => {
    expect(POOL_PAIRS).toHaveLength(3);
    const labels = POOL_PAIRS.map(p => p.label);
    expect(labels).toContain('ETH/USDC');
    expect(labels).toContain('ETH/USDT');
    expect(labels).toContain('USDC/USDT');
  });

  it('getConfig reads RPC_URL from env', () => {
    process.env.RPC_URL = 'https://example.com/rpc';
    const cfg = getConfig();
    expect(cfg.rpcUrl).toBe('https://example.com/rpc');
    delete process.env.RPC_URL;
  });

  it('getConfig throws when RPC_URL is missing', () => {
    delete process.env.RPC_URL;
    expect(() => getConfig()).toThrow('RPC_URL');
  });
});
