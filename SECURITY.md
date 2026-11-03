# Security

This document covers how Optimus is protected, what a November 2026 audit of
the codebase found, and the risks that remain by design.

## Reporting a vulnerability

Please don't open a public issue. Use **Report a vulnerability** on the
repository's **Security** tab, which sends the report to me privately.

## Threat model

Optimus is a public demo. Anyone can open the dashboard and browse inventory
data, which is synthetic. The things worth protecting are:

* **Availability.** One request shouldn't be able to take the site down.
* **Integrity of the data set.** Only the owner should be able to wipe or
  regenerate it, and only the store's sensors should be able to post readings.
* **The visitor's browser.** No injected script should be able to run on the
  page.
* **The server.** A bug in the app shouldn't hand an attacker root on the host.

## Controls

### Authentication for writes

| Endpoint | Protection |
|----------|-----------|
| `POST /api/demo/regenerate` | `X-Admin-Token` must match `ADMIN_TOKEN` |
| `POST /api/transfers/generate-recommendations` | `X-Admin-Token` must match `ADMIN_TOKEN` |
| `POST /api/telemetry` | `X-API-Key` must match `TELEMETRY_API_KEY` |
| Transfer drafts and status changes | Open on purpose so visitors can try the workflow; inputs are bounded and status changes follow the real lifecycle |
| Everything else | Read-only |

Secrets are compared in constant time. With `ENVIRONMENT=production`, an unset
secret **disables** its endpoint instead of leaving it open, so a forgotten
variable fails safe. The admin token is only held in memory on the Admin page
for the one confirmation it's typed into.

### Input validation

* Every numeric query and body parameter has bounds (for example `limit ≤ 200`,
  `qty` between 1 and 10,000, at most 500 SKUs and 120 days of generated data).
* Sensor names must match `^[a-z0-9_]{1,64}$`, and readings must be finite
  (Python's JSON parser accepts `NaN` and `Infinity` otherwise).
* Validation errors return the field and message but never echo the submitted
  value back.
* All database access goes through SQLAlchemy with bound parameters; there's no
  raw SQL.

### HTTP security headers

| Header | Pages (Next.js) | API (FastAPI) |
|--------|-----------------|---------------|
| `Content-Security-Policy` | Per-request nonce with `'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` | `default-src 'none'` (docs pages get a policy that allows their CDN assets) |
| `Strict-Transport-Security` | 2 years, `includeSubDomains` | same |
| `X-Content-Type-Options` | `nosniff` | `nosniff` |
| `X-Frame-Options` | `DENY` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `no-referrer` |
| `Permissions-Policy` | camera, microphone, geolocation, payment, USB, topics off | same set |
| `Cross-Origin-Opener-Policy` | `same-origin` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` | `same-site` |
| `Cache-Control` | framework default | `no-store` on `/api/*` |

`X-Powered-By` and the uvicorn `Server` header are removed. CORS allows only
the configured origin, only `GET`/`POST`/`PATCH`, and no credentials.

### Containers

* Both images run as unprivileged users (`nextjs`, `app`).
* The compose file sets `read_only: true`, `no-new-privileges`, and drops every
  Linux capability. The backend keeps only `CHOWN`, `SETUID` and `SETGID`, which
  its entrypoint uses once to hand the data volume to the `app` user before it
  drops to that user. The running process has no effective capabilities.
* No services publish ports; Traefik reaches them over Dokploy's network.
* The images install no extra OS packages (the healthcheck uses Python instead
  of curl).

### Dependencies

Production dependencies are pinned to exact versions, chosen to be at least two
weeks old, and audited with `pip-audit` and `npm audit`.

## Audit findings (November 2026)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | Critical | Next.js 14.1.0 had over 30 published advisories, including unauthenticated RCE in the image optimizer, SSRF, cache poisoning and middleware auth bypass | Upgraded to Next.js 16.4.2 (0 advisories); React 19.3 and Recharts 3 to match |
| 2 | High | Anyone could wipe and regenerate the whole database with one unauthenticated request | Admin token required; disabled in production without one |
| 3 | High | Backend dependencies had 41 known vulnerabilities (FastAPI/Starlette DoS, `python-multipart` ReDoS, `python-jose` algorithm confusion) | Upgraded FastAPI to 0.143.3 and Starlette to 1.8.0; removed `python-jose`, `passlib` and `python-multipart`, which were never used |
| 4 | High | Unbounded parameters (`limit`, `num_skus`, `days_history`, …) let one request do arbitrarily large work | Bounds on every parameter |
| 5 | Medium | Regenerating data blocked the event loop for about 20 seconds, freezing the site for everyone | Runs in a worker thread with a lock against concurrent runs |
| 6 | Medium | Anyone could post fake sensor readings, including `NaN` and `Infinity` | Device API key, input validation |
| 7 | Medium | Transfers accepted negative quantities and any status change (e.g. received back to draft) | Quantity bounds and an enforced state machine |
| 8 | Medium | No security headers on pages or API | Headers above, including a nonce-based CSP |
| 9 | Medium | Frontend image used Node 18, which is end-of-life and no longer gets security fixes | Node 22 LTS |
| 10 | Medium | Backend container ran as root | Non-root user, read-only filesystem, capabilities dropped |
| 11 | Low | Error responses included raw exception text | Generic message; details go to the server log |
| 12 | Low | CORS allowed every method and header, with credentials | Narrowed to what the app uses, no credentials |
| 13 | Low | Framework and server version headers exposed | Removed |
| 14 | Info | `SECRET_KEY` was required at deploy time but never used | Made optional and documented as unused |

Git history was also scanned for committed secrets; nothing was found apart from
placeholder values in example code.

## Known limitations

* **No rate limiting in the app.** Read endpoints and transfer drafts are open by
  design. If the public demo gets abused, add a rate-limit middleware in front
  of it in Traefik or Dokploy.
* **`style-src 'unsafe-inline'`.** React and Recharts render inline style
  attributes. Scripts are still locked to the nonce, so this doesn't allow
  script injection.
* **One shared device key.** Every sensor uses the same `TELEMETRY_API_KEY`.
  Per-device keys would make it possible to revoke one device.
* **Dev-only advisories.** `npm audit` still reports 16 moderate advisories, all
  from one `minimatch` ReDoS deep in the ESLint toolchain. It never ships in the
  production image.
* **SQLite.** Backups are a manual copy of the volume (see `DEPLOY_DOKPLOY.md`).
