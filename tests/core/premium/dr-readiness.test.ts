import { describe, expect, it } from 'vitest';
import {
  assertDigitalRepresentativeReady,
  DigitalRepresentativeNotReadyError,
  evaluateDigitalRepresentativeReadiness,
} from '@semblance/core/premium/dr-readiness';

describe('dr-readiness', () => {
  it('allows free users without artifact', () => {
    expect(
      evaluateDigitalRepresentativeReadiness({
        isPremium: false,
        artifactPresent: false,
        artifactValid: false,
      }).ready,
    ).toBe(true);
  });

  it('fails paid readiness without artifact', () => {
    expect(() =>
      assertDigitalRepresentativeReady({
        isPremium: true,
        artifactPresent: false,
        artifactValid: false,
      }),
    ).toThrow(DigitalRepresentativeNotReadyError);

    expect(() =>
      assertDigitalRepresentativeReady({
        isPremium: true,
        artifactPresent: true,
        artifactValid: false,
      }),
    ).toThrow(/verification/i);
  });

  it('passes paid readiness with valid artifact', () => {
    expect(() =>
      assertDigitalRepresentativeReady({
        isPremium: true,
        artifactPresent: true,
        artifactValid: true,
      }),
    ).not.toThrow();
  });
});
