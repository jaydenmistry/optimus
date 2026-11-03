import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request Content-Security-Policy with a script nonce.
 *
 * Next.js reads the nonce from the request's CSP header and adds it to its own
 * inline bootstrapping scripts; the root layout passes the same nonce to the
 * theme script. With 'strict-dynamic', only those nonce'd scripts (and what
 * they load) can run, so injected markup can't execute JavaScript.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const isDev = process.env.NODE_ENV === 'development';

function apiOrigin() {
  try {
    return new URL(API_URL).origin;
  } catch {
    return '';
  }
}

function buildCsp(nonce: string) {
  const api = apiOrigin();
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-eval' only for the dev server's hot reloading
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // React and Recharts render inline style attributes
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(api ? [api] : []), ...(isDev ? ['ws:'] : [])],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  // Upgrading would break plain-HTTP local runs, so only add it for HTTPS deployments
  if (API_URL.startsWith('https://')) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: skip static assets and prefetches
      source: '/((?!_next/static|_next/image|images/|icon.svg|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
