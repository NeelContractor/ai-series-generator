from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    bible,
    dashboard,
    episodes,
    health,
    jobs,
    planning,
    questions,
    render,
    series,
    shots,
    storyboard,
)
from app.core.config import settings
from app.db.base import engine, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Backend API for the AI Series Generator.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "meta", "description": "Health and service metadata."},
        {
            "name": "dashboard",
            "description": "Aggregated overview data for the home dashboard.",
        },
        {"name": "series", "description": "Series projects and script analysis."},
        {
            "name": "jobs",
            "description": (
                "Background job status for analyze, plan, storyboard, "
                "render, and shot retry."
            ),
        },
        {"name": "questions", "description": "Gap questions and answers."},
        {"name": "planning", "description": "Episode count, planning, and QA."},
        {"name": "episodes", "description": "Episode outline editing."},
        {"name": "bible", "description": "Series bible lock and retrieval."},
        {
            "name": "storyboard",
            "description": "Storyboard generation, shots, versions, and approval.",
        },
        {
            "name": "render",
            "description": "Render workflow, SSE progress, retries, and delivery.",
        },
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.cors_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(dashboard.router)
app.include_router(series.router)
app.include_router(jobs.router)
app.include_router(questions.router)
app.include_router(planning.router)
app.include_router(episodes.router)
app.include_router(bible.router)
app.include_router(storyboard.router)
app.include_router(shots.router)
app.include_router(render.router)
app.include_router(render.shots_router)

Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
media_prefix = "/" + settings.media_url_prefix.strip("/")
app.mount(
    media_prefix,
    StaticFiles(directory=settings.media_dir),
    name="media",
)


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "health": "/health",
    }
