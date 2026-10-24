from enum import Enum


class Tone(str, Enum):
    THRILLER = "thriller"
    ROMANCE = "romance"
    COMEDY = "comedy"
    DRAMA = "drama"
    MYSTERY = "mystery"


class EpisodeLength(int, Enum):
    ONE_MINUTE = 1
    TWO_MINUTES = 2
    THREE_MINUTES = 3
    FIVE_MINUTES = 5


class SeriesState(str, Enum):
    UPLOADED = "UPLOADED"
    ANALYZED = "ANALYZED"
    QUESTIONS = "QUESTIONS"
    BIBLE_LOCKED = "BIBLE_LOCKED"
    STORYBOARD = "STORYBOARD"
    APPROVED = "APPROVED"
    RENDERING = "RENDERING"
    ASSEMBLED = "ASSEMBLED"
    DONE = "DONE"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class JobType(str, Enum):
    ANALYZE = "analyze"
    PLAN = "plan"
    STORYBOARD = "storyboard"
    RENDER = "render"
    SHOT_RETRY = "shot_retry"


class EndingType(str, Enum):
    CLIFFHANGER = "cliffhanger"
    CONCLUSION = "conclusion"


class HookType(str, Enum):
    UNANSWERED_QUESTION = "unanswered_question"
    SHOCKING_REVEAL = "shocking_reveal"
    CHARACTER_IN_DANGER = "character_in_danger"
    BETRAYAL = "betrayal"
    SUDDEN_TWIST = "sudden_twist"
    IMPOSSIBLE_CHOICE = "impossible_choice"


class EpisodeCountSource(str, Enum):
    USER = "user"
    AUTO = "auto"


class RenderRunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class ShotRenderStatus(str, Enum):
    QUEUED = "queued"
    RENDERING = "rendering"
    RENDERED = "rendered"
    FAILED = "failed"


class EpisodeRenderStatus(str, Enum):
    QUEUED = "queued"
    RENDERING = "rendering"
    ASSEMBLED = "assembled"
    FAILED = "failed"
