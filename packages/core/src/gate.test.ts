import { describe, expect, it } from 'vitest';
import {
  AriaGateViolation,
  assertGate,
  fixKindForBasis,
  isGateSafe,
  tierForBasis,
} from './index';

describe('tier / basis policy', () => {
  it('maps native and declared to the format tier', () => {
    expect(tierForBasis('native')).toBe('format');
    expect(tierForBasis('declared')).toBe('format');
  });

  it('maps inferred to the lint tier', () => {
    expect(tierForBasis('inferred')).toBe('lint');
  });

  it('derives an auto-fix only for format-tier basis', () => {
    expect(fixKindForBasis('native')).toBe('auto');
    expect(fixKindForBasis('declared')).toBe('auto');
    expect(fixKindForBasis('inferred')).toBe('suggestion');
  });
});

describe('the gate', () => {
  it('allows an auto-fix for native or declared basis', () => {
    expect(isGateSafe({ basis: 'native', fixKind: 'auto' })).toBe(true);
    expect(isGateSafe({ basis: 'declared', fixKind: 'auto' })).toBe(true);
  });

  it('allows a suggestion on any basis', () => {
    expect(isGateSafe({ basis: 'inferred', fixKind: 'suggestion' })).toBe(true);
    expect(isGateSafe({ basis: 'native', fixKind: 'suggestion' })).toBe(true);
  });

  it('allows report-only on any basis', () => {
    expect(isGateSafe({ basis: 'inferred', fixKind: null })).toBe(true);
  });

  // The deliberately mis-tagged fixture: an inferred guess wearing an auto-fix.
  // This is the single thing the whole product must never do. If this test ever
  // goes green by accident, the safety story is broken.
  it('rejects an auto-fix for inferred basis', () => {
    expect(isGateSafe({ basis: 'inferred', fixKind: 'auto' })).toBe(false);
    expect(() => assertGate({ basis: 'inferred', fixKind: 'auto' })).toThrow(
      AriaGateViolation,
    );
  });
});
