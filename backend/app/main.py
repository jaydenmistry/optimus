"""
FastAPI main application
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import settings
from .database import init_db, SessionLocal
from .security import SecurityHeadersMiddleware
from .api import overview, sku, transfers, demo, peak_hours, telemetry, simulation
from .simulation import runner as simulation_runner


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and generate demo data on startup"""
    init_db()
    print("✅ Database initialized")

    db = SessionLocal()
    try:
        from .models import Store
        store_count = db.query(Store).count()

        if store_count == 0:
            print("📊 No data found. Generating demo data...")
            from .utils.demo_data import generate_demo_data
            generate_demo_data()
            print("✅ Demo data generated successfully")
        else:
            print(f"✅ Found existing data ({store_count} stores)")
    except Exception as e:
        print(f"⚠️  Error checking/generating demo data: {e}")
    finally:
        db.close()

    if settings.is_production:
        if not settings.ADMIN_TOKEN:
            print("🔒 ADMIN_TOKEN not set: demo data reset is disabled")
        if not settings.TELEMETRY_API_KEY:
            print("🔒 TELEMETRY_API_KEY not set: sensor ingestion is disabled")

    # Demo mode: bring the data up to date, then keep it moving in the background
    stop = asyncio.Event()
    sim_task = None
    if settings.SIMULATION_ENABLED:
        await asyncio.to_thread(simulation_runner.startup)
        sim_task = asyncio.create_task(simulation_runner.run_forever(stop))
        print(f"🎛️  Simulation running (sensors every {settings.SIMULATION_INTERVAL_SECONDS}s)")
    yield
    stop.set()
    if sim_task:
        await sim_task


# Create FastAPI app
app = FastAPI(
    title="Optimus Inventory Health Dashboard API",
    description="Predictive inventory management with anomaly detection and transfer optimization",
    version="1.0.0",
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """
    Same 422 shape as FastAPI's default, minus the echoed `input` value. Not
    reflecting request data back avoids leaking it, and avoids a 500 when the
    rejected value is something JSON can't encode (NaN, Infinity).
    """
    errors = [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})

# Configure CORS. In production the frontend and API share one origin, so this
# only matters for local development (frontend on :3000, API on :8000).
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,  # the API uses headers, never cookies
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "X-Admin-Token", "X-API-Key"],
    max_age=600,
)

# Include API routers
app.include_router(overview.router, prefix="/api", tags=["overview"])
app.include_router(sku.router, prefix="/api", tags=["sku"])
app.include_router(transfers.router, prefix="/api", tags=["transfers"])
app.include_router(demo.router, prefix="/api", tags=["demo"])
app.include_router(peak_hours.router, prefix="/api", tags=["peak-hours"])
app.include_router(telemetry.router, prefix="/api", tags=["telemetry"])
app.include_router(simulation.router, prefix="/api", tags=["simulation"])


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "version": "1.0.0",
        "service": "inventory-health-dashboard"
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Optimus Inventory Health Dashboard API",
        "docs": "/docs",
        "health": "/api/health",
        "endpoints": {
            "overview": "/api/overview",
            "sku_detail": "/api/sku/{store_id}/{sku_id}",
            "transfers": "/api/transfers/recommendations",
            "demo_stats": "/api/demo/stats"
        }
    }
