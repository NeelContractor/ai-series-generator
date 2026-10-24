# AI Series Generator API

FastAPI backend. Phases 1-4 cover the full MVP flow: script analysis, gap
questions, episode planning, QA, the locked series bible, storyboard/cost gate,
render workflow, SSE progress, retries, and episode delivery.

## Development

```bash
uv sync
uv run fastapi dev app/main.py
```

Then open:

- Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- Health: http://127.0.0.1:8000/health

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| POST | `/series` | Create a series |
| GET | `/series` | List series |
| GET | `/series/{id}` | Series detail and current state |
| POST | `/series/{id}/analyze` | Start analysis (202 + `job_id`) |
| GET | `/series/{id}/analysis` | Characters, locations, arcs, completeness |
| GET | `/jobs/{job_id}` | Poll any background job |
| GET | `/series/{id}/questions` | Gap questions with options + auto-decide |
| POST | `/series/{id}/answers` | Submit a batch of answers |
| GET | `/series/{id}/episode-count` | Suggested count and warning |
| PUT | `/series/{id}/episode-count` | Confirm or adjust the count |
| POST | `/series/{id}/plan` | Plan episodes, hooks, endings (202 + `job_id`) |
| GET | `/series/{id}/episodes` | Episode outlines |
| PATCH | `/episodes/{id}` | Edit an outline or hook |
| POST | `/series/{id}/validate` | QA hook/finale checks |
| POST | `/series/{id}/bible/lock` | Freeze the series bible |
| GET | `/series/{id}/bible` | Frozen bible JSON |
| POST | `/series/{id}/storyboard` | Generate storyboard (202 + `job_id`) |
| GET | `/series/{id}/storyboard` | Storyboard with scenes, shots, keyframe URLs |
| PATCH | `/shots/{id}` | Edit prompt, duration, or references |
| POST | `/shots/{id}/regenerate` | Regenerate one shot and bump its version |
| GET | `/shots/{id}/versions` | Shot asset version history |
| GET | `/series/{id}/estimate` | Live cost and render-time estimate |
| POST | `/series/{id}/storyboard/approve` | Approve the storyboard cost gate |
| POST | `/series/{id}/render` | Start render from `APPROVED` (202 + `job_id`) |
| GET | `/series/{id}/render` | Latest render run snapshot |
| GET | `/series/{id}/events` | SSE stream of render progress |
| GET | `/series/{id}/episodes/{n}/video` | Final assembled episode URL |
| POST | `/shots/{id}/retry` | Retry a failed shot (202 + `job_id`) |

## Async jobs

Every slow mutation returns `202 Accepted` with:

```json
{ "job_id": "...", "type": "plan", "status": "queued" }
```

The response also sets `Location: /jobs/{job_id}`. Poll `GET /jobs/{job_id}`
until `status` is `succeeded` or `failed`, then read the artifact-specific
endpoint (for example `GET /series/{id}/episodes` after a `plan` job). For
render and shot-retry jobs, `GET /series/{id}/events` is an SSE upgrade over
polling; it emits the same render snapshot with per-shot and per-episode
status.

Jobs are persisted so they are pollable across requests. The runner currently
uses FastAPI `BackgroundTasks`, which is process-local and not durable; replace
it with Celery/Temporal for restart-safe production execution.

## State guards

Transitions are enforced server-side at enqueue time and re-checked when the
job starts. Examples:

- `POST /series/{id}/plan` requires an analyzed, unlocked series.
- `POST /series/{id}/storyboard` requires `BIBLE_LOCKED`.
- `POST /series/{id}/render` requires `APPROVED`.
- Only one active job per series/type is allowed; duplicates return `409` with
  the active `job_id`.
- Outline, answer, and count edits are rejected while a plan job is running.

## Flow

`UPLOADED → ANALYZED → QUESTIONS → BIBLE_LOCKED → STORYBOARD → APPROVED → RENDERING → ASSEMBLED → DONE`

After analysis, fetch questions, submit answers (or use `auto`), pick an
episode count, run the planner, validate, then lock the bible. Once locked,
bible/outline edits return `409`. Generate the storyboard next, review and
regenerate shots, then approve it as the cost gate. Storyboard edits are only
allowed in `STORYBOARD`; after `APPROVED` they return `409`. Start the render
from `APPROVED`, follow progress over SSE, and fetch each episode when it is
assembled.

Storyboard assets are deterministic placeholder SVGs written to `MEDIA_DIR`
(default `./media`) and served from `/media`. The render worker produces a
self-contained animated SVG per episode (embedded keyframes) as the free/local
video deliverable. Cost rates default to `0` and can be set with `COST_PER_*`
env vars.

## Docker Compose

From the repo root:

```bash
docker compose up --build
```

This starts Postgres, Redis, MinIO (S3-compatible object storage), the API, the
web app, and Adminer:

- Web: http://localhost:3000
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Adminer: http://localhost:8080 (server `postgres`, user/password/db `seriesforge`)
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

The API container uses `postgresql+asyncpg://seriesforge:seriesforge@postgres:5432/seriesforge`.
Stop the stack with `docker compose down`; add `-v` to delete the volumes.

> Drizzle is a TypeScript ORM, not a service. This backend uses SQLAlchemy +
> asyncpg; Adminer is included as the database UI. If you want Drizzle ORM or
> Drizzle Studio, that is a separate frontend/data-layer decision.

## Storage

Defaults to SQLite at `./app.db`. Set `DATABASE_URL` to use Postgres
(`postgresql+asyncpg://...`). `asyncpg` is included in the project dependencies.

The analyzer is a deterministic, rule-based placeholder behind the
`ScriptAnalyzer` protocol in `app/services/analysis.py`, so it can be swapped
for an LLM provider later.

## Typed client

The OpenAPI schema is exported into the shared `@repo/api-client` package:

```bash
cd packages/api-client
bun run generate
```

That writes `openapi.json`, regenerates `src/schema.d.ts`, and exposes a typed
`openapi-fetch` client plus `waitForJob` and `subscribeToRenderEvents` helpers.
`apps/web` already depends on `@repo/api-client`:

```ts
import {
  createApiClient,
  subscribeToRenderEvents,
  waitForJob,
} from "@repo/api-client";

const api = createApiClient("http://127.0.0.1:8000");
const started = await api.POST("/series/{series_id}/render", {
  params: { path: { series_id: seriesId } },
});
const job = await waitForJob(api, started.data!.job_id);
```

SSE is not described by OpenAPI, so the event payload type is hand-written in
the client package against the generated `RenderStatusRead` schema.

## Product rules

`POST /series/{id}/validate` enforces the outline rules before the bible can
be locked:

- Every non-final episode must use `ending_type: cliffhanger` and have both a
  `hook_type` and `hook_description`.
- Consecutive episodes cannot repeat the same `hook_type`.
- Hooks must escalate in stakes from early questions/twists, through reveals
  and betrayals, to impossible choices and immediate danger.
- The final episode must use `ending_type: conclusion`, must not have a hook,
  and its summary must signal resolution of the main arcs and open threads.
- Generated cliffhanger shot prompts include the requirement to place the hook
  in the last 10-15 seconds of the episode.

Content moderation is deterministic and runs before text is persisted or used
to generate assets. Unsafe scripts/titles, episode outlines, shot prompts, and
planned outlines return `422` with:

```json
{
  "message": "script failed content moderation",
  "field": "script",
  "issues": [{ "category": "weapons_instructions", "message": "..." }]
}
```

The moderation patterns are intentionally narrow placeholders; replace them
with a provider-backed moderation service for production.

## Tests

```bash
uv run pytest
```
