import { describe, expect, it } from 'vitest';
import { decideLanding } from './landing';

describe('decideLanding', () => {
  it('sends a signed-in user to the Overview', () => {
    expect(decideLanding(true)).toBe('/overview');
  });

  it('sends a signed-out visitor to /sign-in', () => {
    expect(decideLanding(false)).toBe('/sign-in');
  });
});
