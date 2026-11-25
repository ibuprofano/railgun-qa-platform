import { describe, expect, it } from 'vitest';
import { decideRouteProtection } from './route-protection';

describe('decideRouteProtection', () => {
  it('requires auth for a protected path when signed out', () => {
    expect(decideRouteProtection('/test-cases', false)).toBe('require-auth');
    expect(decideRouteProtection('/test-cases/123', false)).toBe('require-auth');
  });

  it.each(['/overview', '/executions', '/bugs', '/activity', '/trash', '/settings', '/workspace-settings', '/test-cases/x'])(
    'requires auth for every app screen when signed out: %s',
    (path) => {
      expect(decideRouteProtection(path, false)).toBe('require-auth');
      expect(decideRouteProtection(path, true)).toBe('allow');
    },
  );

  it('leaves static files public', () => {
    expect(decideRouteProtection('/favicon.ico', false)).toBe('allow');
    expect(decideRouteProtection('/robots.txt', false)).toBe('allow');
  });

  it('allows a protected path when signed in', () => {
    expect(decideRouteProtection('/test-cases', true)).toBe('allow');
  });

  it('redirects away from sign-in/sign-up when already signed in', () => {
    expect(decideRouteProtection('/sign-in', true)).toBe('redirect-to-root');
    expect(decideRouteProtection('/sign-up', true)).toBe('redirect-to-root');
  });

  it('allows sign-in/sign-up when signed out', () => {
    expect(decideRouteProtection('/sign-in', false)).toBe('allow');
    expect(decideRouteProtection('/sign-up', false)).toBe('allow');
  });

  it('allows an unrelated path regardless of session state', () => {
    expect(decideRouteProtection('/', false)).toBe('allow');
    expect(decideRouteProtection('/', true)).toBe('allow');
  });
});
