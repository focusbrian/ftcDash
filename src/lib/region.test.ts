import { describe, expect, it } from 'vitest';
import { rankAmong, regionLabel } from './region';

describe('regionLabel', () => {
  it('names US and Canadian regions', () => {
    expect(regionLabel('USMI')).toBe('Michigan');
    expect(regionLabel('CAON')).toBe('Ontario');
    expect(regionLabel('GB')).toBe('United Kingdom');
  });

  it('falls back to the raw code for unknown regions and normalises case', () => {
    expect(regionLabel('usmi')).toBe('Michigan');
    expect(regionLabel('ZZQQ')).toBe('ZZQQ');
  });

  it('has no label for a missing or worldwide region', () => {
    expect(regionLabel(null)).toBeNull();
    expect(regionLabel(undefined)).toBeNull();
    expect(regionLabel('')).toBeNull();
    expect(regionLabel('All')).toBeNull();
  });
});

describe('rankAmong', () => {
  it('counts the values strictly above', () => {
    expect(rankAmong([120, 100, 80, 60], 80)).toBe(3);
    expect(rankAmong([120, 100, 80, 60], 200)).toBe(1);
    expect(rankAmong([120, 100, 80, 60], 10)).toBe(5);
  });

  it('shares a rank between ties', () => {
    expect(rankAmong([50, 50, 30], 50)).toBe(1);
    expect(rankAmong([60, 50, 50, 30], 50)).toBe(2);
  });

  it('ranks a lone value first and handles an empty pool', () => {
    expect(rankAmong([7], 7)).toBe(1);
    expect(rankAmong([], 7)).toBe(1);
  });
});
