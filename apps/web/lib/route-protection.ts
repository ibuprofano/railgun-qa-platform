export type RouteDecision = 'require-auth' | 'redirect-to-root' | 'allow';

const AUTH_ROUTE = /^\/(sign-in|sign-up)(\/.*)?$/;
/** A static file (favicon.ico, robots.txt…): never a screen, never gated. */
const STATIC_FILE = /\/[^/]+\.[a-z0-9]+$/i;

/**
 * Every screen of the signed-in app requires a session (specs/web-app-shell). Only the
 * root (which redirects on its own), the sign-in/sign-up routes and static files are
 * public: a public list rather than a list of protected screens, so a new screen is
 * protected by default (overview-dashboard design.md decision 7).
 */
function isPublic(pathname: string): boolean {
  return pathname === '/' || AUTH_ROUTE.test(pathname) || STATIC_FILE.test(pathname);
}

/**
 * Pure decision logic for proxy.ts's route protection — kept separate from the
 * Clerk/Next.js runtime glue (clerkMiddleware, NextRequest) so it's unit-testable
 * without mocking the request pipeline (design.md).
 */
export function decideRouteProtection(pathname: string, isSignedIn: boolean): RouteDecision {
  if (AUTH_ROUTE.test(pathname) && isSignedIn) {
    return 'redirect-to-root';
  }
  if (!isPublic(pathname) && !isSignedIn) {
    return 'require-auth';
  }
  return 'allow';
}
