# Deploying Optimus on Dokploy

This guide deploys the full stack (FastAPI backend + Next.js frontend) to
**https://optimus.jmistry.com** using Dokploy's **Docker Compose** service type.

## How it is wired

```
                    https://optimus.jmistry.com
                               │
                     Traefik (managed by Dokploy, TLS via Let's Encrypt)
                               │
          ┌────────────────────┴─────────────────────┐
          │ /api/*, /docs, /openapi.json             │ everything else
          ▼                                          ▼
   backend  (FastAPI, port 8000)             frontend (Next.js, port 3000)
          │
   volume optimus-data → /app/data/inventory.db (SQLite)
```

Everything runs on one domain. Traefik sends the `/api` paths to the backend
and the rest to the frontend, so the browser never makes a cross-origin call.

Deployment files:

| File | Purpose |
|------|---------|
| `docker-compose.dokploy.yml` | Production compose file Dokploy deploys |
| `backend/Dockerfile.prod` | Backend image (Python 3.11, uvicorn, single worker, non-root) |
| `backend/docker-entrypoint.sh` | Hands the data volume to the unprivileged `app` user, then starts the server as that user |
| `frontend/Dockerfile.prod` | Multi-stage Next.js image using `output: 'standalone'` |
| `backend/.dockerignore`, `frontend/.dockerignore` | Keep local junk out of the build context |

The original `docker-compose.yml` is unchanged and is still the local dev setup
(hot reload, localhost ports).

> **Important:** `NEXT_PUBLIC_API_URL` is compiled into the browser JavaScript
> at **build time**. If you ever change the domain, update the variable and
> **redeploy** so the frontend gets rebuilt. A restart is not enough.

---

## 1. Prerequisites

- A server (VPS) with Dokploy installed (`curl -sSL https://dokploy.com/install.sh | sh`)
  and the Dokploy dashboard reachable, usually at `http://<server-ip>:3000`.
- Ports **80** and **443** open on the server firewall/security group. Traefik
  needs both, including for the Let's Encrypt HTTP challenge.
- At least **2 GB RAM**. The Next.js build runs on the server and needs the memory.
  On a 1 GB box, add swap first.
- This repository pushed to GitHub (`jaydenmistry/optimus`), with these files
  on the branch you plan to deploy (e.g. merged into `main`).

## 2. Point the domain at the server

At your DNS provider for `jmistry.com`, create:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| `A` | `optimus` | `<your server's public IPv4>` | Auto / 300 |

(Add an `AAAA` record too if the server has IPv6 and Traefik listens on it.)

**If DNS is on Cloudflare:** set the record to **DNS only (grey cloud)** for the
first deploy so Let's Encrypt can issue the certificate directly. You can turn
the orange-cloud proxy on later, but then set Cloudflare SSL/TLS mode to
**Full (strict)** or you'll get redirect loops.

Check that the record has propagated before going further:

```bash
dig +short optimus.jmistry.com
```

It should print your server's IP.

## 3. Connect GitHub to Dokploy (one-time)

1. In Dokploy go to **Settings → Git** (called *Git Providers* in some versions).
2. Choose **GitHub** and follow the flow to create/install the Dokploy GitHub App.
3. Grant it access to the `jaydenmistry/optimus` repository.

(If you'd rather not install an app, you can use the **Git** provider with the
repo URL plus an SSH deploy key instead.)

## 4. Create the project and compose service

1. **Projects → Create Project**, name it `optimus`.
2. Inside the project: **Create Service → Compose**.
   - Name: `optimus`
   - Compose type: **Docker Compose** (not Stack)
3. In the service's **General** tab, set the source:
   - Provider: **GitHub**
   - Repository: `jaydenmistry/optimus`
   - Branch: `main` (or whichever branch has these files)
   - **Compose Path:** `./docker-compose.dokploy.yml`  ← important, the default is `./docker-compose.yml`, which is the dev setup
4. Click **Save**.

## 5. Set environment variables

Open the service's **Environment** tab and paste:

```env
ADMIN_TOKEN=<a long random string>
TELEMETRY_API_KEY=<a different long random string>
NEXT_PUBLIC_API_URL=https://optimus.jmistry.com
CORS_ORIGINS=https://optimus.jmistry.com
```

Generate each secret with:

```bash
openssl rand -hex 32
```

What they do:

| Variable | Purpose | If you leave it empty |
|----------|---------|-----------------------|
| `ADMIN_TOKEN` | Required to wipe and regenerate demo data (the Admin page asks for it). | Regenerating is disabled on the public site. |
| `TELEMETRY_API_KEY` | Sensors must send it as the `X-API-Key` header to post readings. | Sensor ingestion is disabled. |
| `DOCS_ENABLED` | Set to `false` to hide `/docs`, `/redoc` and `/openapi.json`. | Docs stay on (default `true`). |
| `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS` | Public URL of the site. | Default to `https://optimus.jmistry.com`. |
| `SIMULATION_ENABLED` | Keeps the demo data current and simulates the sensors. Set to `false` to turn the simulator off. | On (default `true`). |
| `SIMULATE_SENSORS`, `SIMULATION_INTERVAL_SECONDS` | Simulated sensor readings and how often they arrive. | On, every 20 seconds. |
| `SCENARIOS_ENABLED` | The public **Run a scenario** buttons. | On (default `true`). |
| `TZ` | Store time zone for "today", the daily roll-forward and the Peak Hours clock. | `America/New_York`. |

The compose file sets `ENVIRONMENT=production`, which is what makes an empty
secret mean "disabled" rather than "open". `SECRET_KEY` is no longer needed;
nothing reads it, so you can delete it from the Environment tab.

Dokploy writes these into a `.env` file next to the compose file, and the
compose file reads them through `${VAR}` substitution. Click **Save**.

## 6. Add the domains

Open the **Domains** tab and add these entries. Each one is a separate
**Add Domain** click:

| # | Service | Host | Path | Container Port | HTTPS | Certificate |
|---|---------|------|------|----------------|-------|-------------|
| 1 | `frontend` | `optimus.jmistry.com` | `/` | `3000` | On | Let's Encrypt |
| 2 | `backend` | `optimus.jmistry.com` | `/api` | `8000` | On | Let's Encrypt |
| 3 | `backend` | `optimus.jmistry.com` | `/docs` | `8000` | On | Let's Encrypt |
| 4 | `backend` | `optimus.jmistry.com` | `/openapi.json` | `8000` | On | Let's Encrypt |

Notes:
- Leave **Strip Path** **off** for the backend entries. The FastAPI routes
  already start with `/api`, so the prefix has to reach the container.
- Entries 3 and 4 are optional and only expose the Swagger UI at
  `https://optimus.jmistry.com/docs`. Skip them if you don't want the API
  docs public. The app works without them.
- Traefik picks the most specific route, so `/api/...` goes to the backend even
  though `/` also matches.
- You don't need to add `dokploy-network` or Traefik labels to the compose file
  yourself. Dokploy injects both for compose services that have domains
  configured. If your Dokploy version is old and the domains return 404,
  update Dokploy first.

## 7. Deploy

1. Click **Deploy** (top right of the service).
2. Watch the **Deployments** tab and click the running deployment to see build
   logs. The first build takes a few minutes (npm install + Next.js build + pip install).
3. On first start the backend generates the demo data set (5 stores, 200 SKUs,
   60 days of history). This takes about 15–30 seconds. The frontend waits until
   the backend healthcheck passes before it starts.
4. Let's Encrypt usually issues the certificate within a minute of the first request.

## 8. Verify

```bash
curl https://optimus.jmistry.com/api/health
```

Expected: `{"status":"ok","version":"1.0.0","service":"inventory-health-dashboard"}`

Then open in a browser:
- https://optimus.jmistry.com: overview dashboard with inventory data
- https://optimus.jmistry.com/transfers
- https://optimus.jmistry.com/peak-hours
- https://optimus.jmistry.com/admin: database statistics should show 5 stores / 200 SKUs
- https://optimus.jmistry.com/docs: Swagger UI (if you added domains 3 and 4)

## 9. Auto-deploy on push (optional)

In the service's **General** tab turn on **Autodeploy**. With the GitHub
provider, every push to the selected branch triggers a rebuild. With the plain
Git provider, copy the webhook URL from the **Deployments** tab and add it in
GitHub under **Repo → Settings → Webhooks** (content type `application/json`,
event: *push*).

## 10. Data persistence and backups

The SQLite database lives in the named Docker volume `optimus-data`, mounted at
`/app/data` in the backend. It persists across redeploys and restarts. Dokploy
prefixes volume names with the app name, so check the real name with
`docker volume ls | grep optimus-data`.

Manual backup from the server:

```bash
docker cp $(docker ps -qf "name=backend" | head -1):/app/data/inventory.db ./inventory-$(date +%F).db
```

(If you run other compose apps with a `backend` service, narrow the filter, e.g.
`docker ps --format '{{.Names}}' | grep optimus`.)

To **reset** to fresh demo data, either use the regenerate button on the
`/admin` page or delete the volume from Dokploy's **Advanced → Volumes**
section (or `docker volume rm <name>` after stopping the app) and redeploy.

## 11. Sending real sensor data (hardware bridge)

The Arduino bridge and the simulator default to `http://localhost:8000`. Point
them at production and give them the `TELEMETRY_API_KEY` value:

```bash
TELEMETRY_API_KEY=<your key> python hardware/telemetry_bridge.py --api https://optimus.jmistry.com/api/telemetry --store-id 1
```

```bash
API_URL=https://optimus.jmistry.com/api/telemetry TELEMETRY_API_KEY=<your key> ./simulate_sensors.sh
```

The bridge also applies the cooler calibration (`--cooler-offset`, default
`-20`°C), because the demo sensor sits at room temperature. Pass
`--cooler-offset 0` if it's actually inside a cooler.

## 12. Security

Both containers run as unprivileged users on a read-only filesystem with all
Linux capabilities dropped, except the three the backend's entrypoint needs to
hand the data volume to its `app` user. Every response carries security
headers (a nonce-based Content-Security-Policy on pages, plus HSTS,
`nosniff`, `frame-ancestors 'none'` and others). To check a deployment:

```bash
./check_endpoints.sh
```

It verifies every page and API route, the security headers, and that the
protected write endpoints reject requests without credentials.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| "This action is disabled. Set ADMIN_TOKEN…" on the Admin page | Add `ADMIN_TOKEN` in the Environment tab and redeploy. Same for `TELEMETRY_API_KEY` and sensor posts. |
| Sensors get `401` | The `X-API-Key` they send doesn't match `TELEMETRY_API_KEY`. |
| Data volume permission errors after upgrading | The backend entrypoint fixes ownership on start. Make sure the compose file still has `cap_add: CHOWN, SETUID, SETGID` on the backend. |
| Deploy builds the dev setup / runs `npm run dev` | Compose Path is still `./docker-compose.yml`. Set it to `./docker-compose.dokploy.yml`. |
| Frontend build killed / `exit code 137` | Server ran out of memory during `next build`. Add swap or use a bigger box. |
| Page loads but shows "API Error" / no data | The `/api` domain entry is missing, points to the wrong service, or has **Strip Path** on. Check `curl https://optimus.jmistry.com/api/health`. |
| Browser console shows requests to `localhost:8000` | `NEXT_PUBLIC_API_URL` was wrong at build time. Fix it in Environment and **redeploy**, which rebuilds the bundle. |
| CORS error in browser console | You're opening the site on a different host than `CORS_ORIGINS`. Set `CORS_ORIGINS` (comma-separated for several) and redeploy. |
| Certificate warning / `TRAEFIK DEFAULT CERT` | DNS isn't pointing at the server yet, port 80 is blocked, or Cloudflare proxy is on. Fix that, then redeploy or wait a minute. |
| 404 page from Traefik | Domain not attached to the right service/port, or the containers aren't running. Check the service's **Logs** tab. |
| Frontend container never starts | Backend healthcheck is failing. Check backend logs, since a crash during demo data generation would cause this. |

Useful server-side commands:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep optimus
```

```bash
docker logs -f $(docker ps -qf "name=backend" | head -1)
```
