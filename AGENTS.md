## PROJECT: AI Series Generator (script → multi-episode short video series)

### GOAL
Build a system where a user submits a detailed script for a series, an AI asks clarifying questions about anything missing, and the system generates a complete series of short video episodes (about 2-3 minutes each, user-selectable count, typically 6-7 if auto-decided) with consistent characters, locations, and style. Every episode must hook the viewer into watching the next one.

### USER FLOW
1. Upload or paste the series script (ideally with characters, locations, plot arcs, and episode breakdown).
2. Select the series tone (e.g. thriller, romance, comedy, drama, mystery), a target episode length (1, 2, 3, or 5 minutes), and optionally the number of episodes. If the user doesn't choose a number, the system decides it from the script.
3. The system analyzes the script and scores it for completeness.
4. A question agent asks only about gaps: character appearance, wardrobe, voice, location look, visual style, music mood, aspect ratio. Questions are tappable options where possible, each with an "auto-decide for me" choice. A detailed script triggers few or no questions.
5. The system locks a "series bible" from the script and answers.
6. It generates a storyboard (keyframe image per shot). The user reviews, edits, or regenerates shots, then approves.
7. After approval, it renders all episodes (video, voice, music, SFX), assembles them, and delivers the final series.

### CORE REQUIREMENTS
- EPISODE ENDINGS (applies to every tone): every episode except the last must end on a cliffhanger that makes the viewer want to watch the next episode. The final episode must conclude the story and resolve the main arcs. The tone only changes how the hook is delivered, not whether it exists.
- Cliffhanger design: the planner assigns each non-final episode a specific hook type (unanswered question, shocking reveal, character in danger, betrayal, sudden twist, impossible choice) placed in the last 10-15 seconds. Hooks must escalate across the series and set up the next episode's opening. Avoid repeating the same hook type in consecutive episodes.
- Series arc: episode outlines are planned as a whole so the cliffhangers build toward the finale, and all open threads are resolved in the last episode.
- EPISODE COUNT: the user may set the number of episodes. If not provided, the planner determines it from the script (number of major plot arcs, characters, locations, and story beats) within a sensible range (e.g. 4-10), and shows the chosen count to the user for confirmation or adjustment before the bible is locked. If the user's count is too low or too high for the script, the system warns and suggests a better number. The cliffhanger and finale rules apply at any count. Plot arcs are divided evenly across the chosen count.
- Character, wardrobe, and location consistency across all shots and episodes. Generate canonical reference images once and condition every shot on them.
- Tone drives style: pacing, shot length, color grading, camera style, music mood, and how the cliffhanger is staged (e.g. a thriller hook is a threat, a romance hook is a confession or heartbreak, a comedy hook is an absurd twist).
- Episode length is a user setting. Keep individual shots short (3-8 seconds) and cut between many shots for longer episodes.
- Show a live cost and time estimate before rendering starts, updating as the user changes episode count or length. Storyboard approval is the cost gate.
- Per-shot regeneration without affecting other shots; all assets versioned.
- QA check: a validation step confirms that each non-final episode ends on a hook and the final episode resolves the story, and flags the outline for revision if not.

### PIPELINE
Script ingestion → structured schema extraction (characters, locations, plot, episode outlines) → completeness scoring → question agent → episode count decision (user-set or auto) → series bible (including per-episode ending type: cliffhanger or conclusion) → per-episode planning (episode → scenes → shots with prompts and reference IDs) → keyframe generation → approval → image-to-video per shot → vision-LLM QA (check face, outfit, location against references; auto-retry up to N times, then flag) → TTS dialogue, music, SFX → FFmpeg assembly (stitch, audio mix, subtitles, export).

### ARCHITECTURE
- Client: web/mobile app (script input, Q&A chat, selectors, storyboard review, progress, player).
- Backend API: FastAPI or Node, auth, projects, credits/billing, WebSocket/SSE for live progress.
- Orchestration: Temporal (or Celery + Redis to start); one durable workflow per series with parallel fan-out per shot, retries, and resume.
- AI workers: script analyzer, question agent, planner, image worker, video worker, audio worker, QA checker, assembler.
- Data: Postgres (series, characters, locations, episodes, scenes, shots, job state, version history), S3 + CDN for media, Redis for queues and rate limiting.
- Provider abstraction layer for video, image, and TTS models so providers can be swapped or failed over.

### DATA MODEL (high level)
Series (tone, episode length, episode_count, episode_count_source: user | auto, style guide) → Characters (description, reference images, voice ID) and Locations (description, reference images) → Episodes (ending_type: cliffhanger | conclusion, hook_type, hook_description) → Scenes → Shots (prompt, reference IDs, duration, status, asset URL, versions).

### STATES
UPLOADED → ANALYZED → QUESTIONS → BIBLE_LOCKED → STORYBOARD → APPROVED → RENDERING → ASSEMBLED → DONE

### CROSS-CUTTING
Cost metering per shot and per user credits, per-provider concurrency limits, content moderation on scripts and outputs, observability (per-shot status, failure reasons, latency).

### MVP SCOPE
Start with one script, one episode of 3-5 scenes, end to end: analysis, questions, bible, storyboard, render, assembly, including a cliffhanger ending. Then scale to the full series with escalating hooks, a concluding finale, parallelism, QA retries, billing, and an editing UI.

### DELIVERABLES REQUESTED
1. Detailed system design and service boundaries
2. JSON schema for the series bible (including episode count, per-episode ending type, and hook)
3. Database schema
4. API endpoints
5. Workflow definitions for the orchestrator
6. Prompt templates for the analyzer, question agent, series-arc planner (cliffhanger design and episode-count decision logic), and shot planner
7. A phased implementation plan
