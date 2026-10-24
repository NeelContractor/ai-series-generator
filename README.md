# AI Series Generator

Turn a series script into a multi-episode short-video series with consistent
characters, locations, and a cliffhanger-driven arc.

This repository is a working **deterministic prototype** of the full pipeline:
script ingestion, analysis, gap questions, episode planning, outline QA, series
bible, storyboard review, cost approval, rendering, SSE progress, shot retries,
and episode delivery. Real AI/model providers are not wired in yet.

## What works

- Submit a script, tone, target episode length, and optional episode count.
- Analyze the script and answer only the missing-detail questions.
- Auto-suggest or adjust the episode count with a warning when it does not fit.
- Plan episodes as a series arc with per-episode hooks and finale resolution.
- Validate hooks before locking the series bible.
- Generate canonical character/location reference images and a shot storyboard.
- Review, edit, and regenerate individual shots with version history.
- Approve the storyboard as the cost gate, then render all episodes.
- Follow render progress over SSE and retry failed shots.
- Play assembled episodes from the web app.

## Stack

- **Web:** Next.js 16, React 19, Tailwind CSS 4, shadcn/Radix UI
- **API:** FastAPI, SQLAlchemy async, Pydantic, SQLite/Postgres
- **Client:** generated TypeScript client from the FastAPI OpenAPI schema
- **Infrastructure:** Postgres, Redis, MinIO, Adminer via Docker Compose
- **Monorepo:** Turborepo with Bun workspaces

## Quick start

### Docker Compose

```bash
docker compose up --build
```

Open:

- Web: http://localhost:3000
- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- Adminer: http://localhost:8080
- MinIO console: http://localhost:9001

Development defaults:

- Adminer server: `postgres`
- Postgres user/password/db: `seriesforge` / `seriesforge` / `seriesforge`
- MinIO user/password: `minioadmin` / `minioadmin`

Stop the stack without deleting data:

```bash
docker compose stop
```

Remove containers and keep volumes:

```bash
docker compose down
```

Remove everything, including database and media volumes:

```bash
docker compose down -v
```

### Local development

Prerequisites: Python 3.12+, `uv`, Bun 1.4+, and optionally Docker for
Postgres/MinIO.

```bash
bun install
cd apps/api && uv sync
```

Run the API:

```bash
cd apps/api
uv run fastapi dev app/main.py
```

Run the web app from the repo root:

```bash
bun run dev
```

The local API defaults to SQLite at `apps/api/app.db` and writes media to
`apps/api/media`. The web app defaults to `http://localhost:8000` for the API.

## Environment

The API reads settings from environment variables or `apps/api/.env`. Important
variables:

| Variable                     | Purpose                         | Default                                       |
| ---------------------------- | ------------------------------- | --------------------------------------------- |
| `DATABASE_URL`               | SQLAlchemy database URL         | `sqlite+aiosqlite:///./app.db`                |
| `MEDIA_DIR`                  | Local media output directory    | `./media`                                     |
| `MEDIA_URL_PREFIX`           | Public media URL prefix         | `/media`                                      |
| `CORS_ORIGINS`               | Comma-separated allowed origins | `http://localhost:3000,http://127.0.0.1:3000` |
| `REDIS_URL`                  | Redis connection URL            | `redis://localhost:6379/0`                    |
| `S3_ENDPOINT`                | S3-compatible endpoint          | unset                                         |
| `S3_ACCESS_KEY`              | S3 access key                   | unset                                         |
| `S3_SECRET_KEY`              | S3 secret key                   | unset                                         |
| `S3_BUCKET`                  | S3 bucket                       | `seriesforge`                                 |
| `COST_PER_KEYFRAME_USD`      | Cost estimate per keyframe      | `0`                                           |
| `COST_PER_VIDEO_SECOND_USD`  | Cost estimate per video second  | `0`                                           |
| `COST_PER_EPISODE_AUDIO_USD` | Cost estimate per episode audio | `0`                                           |
| `RENDER_STEP_DELAY_SECONDS`  | Simulated render delay per step | `0.05`                                        |
| `SSE_POLL_INTERVAL_SECONDS`  | Render SSE polling interval     | `0.25`                                        |

Compose also accepts `NEXT_PUBLIC_API_URL`, `POSTGRES_*`,
`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, and `S3_BUCKET`.

> Redis and MinIO are provisioned for future use. The current app stores media
> on local disk and uses process-local background jobs.

## Pipeline

```text
UPLOADED → ANALYZED → QUESTIONS → BIBLE_LOCKED → STORYBOARD
        → APPROVED → RENDERING → ASSEMBLED → DONE
```

1. **Analyze** the script into characters, locations, arcs, and completeness.
2. **Ask** only about gaps, with tappable options and `auto` decisions.
3. **Decide** the episode count (user-set or auto-suggested).
4. **Plan** episodes as a whole series arc.
5. **Validate** hooks, escalation, and finale resolution.
6. **Lock** the series bible.
7. **Generate** reference images and a storyboard with keyframes.
8. **Review** and edit shots, then approve the cost gate.
9. **Render** episodes with SSE progress and per-shot retries.
10. **Deliver** assembled episode assets.

## Product rules

- Every non-final episode must end on a cliffhanger with a `hook_type` and
  `hook_description`.
- Consecutive episodes cannot repeat the same hook type.
- Hooks must escalate in stakes toward the finale.
- The final episode must be a conclusion, have no hook, and signal resolution
  of the main arcs and open threads.
- Generated cliffhanger shot prompts require the hook in the last 10-15
  seconds of the episode.
- Content moderation gates scripts, titles, episode outlines, shot prompts,
  planned outlines, and storyboard approval.
- Storyboard approval is the cost gate; rendering cannot start before approval.

See `apps/api/README.md` for validation codes and moderation response details.

## Repository layout

```text
apps/
  api/                    FastAPI backend, database models, services, tests
  web/                    Next.js app and series workspace UI
packages/
  api-client/             generated OpenAPI TypeScript client
  ui/                     shared React components
  eslint-config/          shared ESLint config
  typescript-config/      shared TypeScript config
docker-compose.yml        Postgres, Redis, MinIO, API, web, Adminer
AGENTS.md                 product requirements and roadmap
```

## API overview

The full endpoint list is in `apps/api/README.md`. Key routes:

- `POST /series`, `GET /series`, `GET /series/{id}`
- `POST /series/{id}/analyze`, `GET /series/{id}/questions`
- `POST /series/{id}/answers`
- `GET/PUT /series/{id}/episode-count`
- `POST /series/{id}/plan`, `POST /series/{id}/validate`
- `POST /series/{id}/bible/lock`
- `POST /series/{id}/storyboard`, `PATCH /shots/{id}`
- `POST /shots/{id}/regenerate`, `GET /shots/{id}/versions`
- `GET /series/{id}/estimate`
- `POST /series/{id}/storyboard/approve`
- `POST /series/{id}/render`, `GET /series/{id}/events`
- `GET /series/{id}/episodes/{n}/video`
- `POST /shots/{id}/retry`
- `GET /dashboard`

Slow mutations return `202` with `{ "job_id", "type", "status" }`. Poll
`GET /jobs/{job_id}` or subscribe to `GET /series/{id}/events` for render
progress.

## Commands

```bash
# Type checking, linting, and production build
bun run check-types
bun run lint
bun run build

# Backend tests
cd apps/api && uv run pytest -q

# Regenerate the typed API client after changing the OpenAPI schema
bun run generate:api
```

There is no root `test` script; backend tests use `uv run pytest`.

## Current limitations

- **No real AI providers yet.** Analysis, planning, images, and video are
  deterministic placeholders.
- **No real media pipeline.** Render produces animated SVG placeholders; there
  is no image-to-video, TTS, music, SFX, subtitles, or FFmpeg assembly.
- **No vision QA.** Character face, wardrobe, and location consistency are not
  yet validated against reference images.
- **Jobs are not durable.** FastAPI `BackgroundTasks` is process-local; a
  restart loses in-flight work.
- **No auth or billing.** All series are global; credits and cost enforcement
  are not implemented.
- **Local media storage.** S3/MinIO and Redis are provisioned but unused.
- **No migrations.** Tables are created with SQLAlchemy `create_all`.
- **Moderation is a narrow regex placeholder.** Replace it with a
  provider-backed moderation service.
- **No CI or browser E2E suite.**

## Documentation

- `AGENTS.md`: product requirements, architecture, and roadmap
- `apps/api/README.md`: API endpoints, async jobs, QA, moderation, and tests
- `packages/api-client/src/client.ts`: typed API client and helpers
