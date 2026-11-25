export type LandingDestination = '/overview' | '/sign-in';

/**
 * Pure decision logic for the root page's landing redirect (design.md's pattern,
 * same as decideRouteProtection) — kept separate from the Clerk/Next.js server
 * helpers so it's unit-testable without mocking them. Signed-in users land on the
 * Overview (specs/web-app-shell).
 */
export function decideLanding(isSignedIn: boolean): LandingDestination {
  return isSignedIn ? '/overview' : '/sign-in';
}
