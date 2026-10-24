from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AI Series Generator API"
    version: str = "0.1.0"
    debug: bool = False
    database_url: str = "sqlite+aiosqlite:///./app.db"
    media_dir: str = "./media"
    media_url_prefix: str = "/media"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    redis_url: str = "redis://localhost:6379/0"
    s3_endpoint: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_bucket: str = "seriesforge"

    cost_per_keyframe_usd: float = 0.0
    cost_per_video_second_usd: float = 0.0
    cost_per_episode_audio_usd: float = 0.0

    render_seconds_per_keyframe: float = 3.0
    render_seconds_per_video_second: float = 1.5
    render_seconds_per_episode_audio: float = 5.0
    render_assembly_seconds: float = 10.0

    render_step_delay_seconds: float = 0.05
    sse_poll_interval_seconds: float = 0.25


settings = Settings()
