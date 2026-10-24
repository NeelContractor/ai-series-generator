import os
import sqlite3
import time
import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient


def wait_for_job(
    client: TestClient, job_id: str, *, timeout_seconds: float = 5.0
) -> dict:
    deadline = time.monotonic() + timeout_seconds
    while True:
        response = client.get(f"/jobs/{job_id}")
        assert response.status_code == 200, response.text
        job = response.json()
        if job["status"] in ("succeeded", "failed"):
            return job
        if time.monotonic() >= deadline:
            raise AssertionError(f"Job {job_id} did not finish in time")
        time.sleep(0.01)


def insert_queued_job(series_id: str, job_type: str) -> str:
    database_url = os.environ["DATABASE_URL"]
    database_path = database_url.split("///", 1)[1]
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "INSERT INTO jobs "
            "(id, series_id, type, status, progress, created_at, updated_at) "
            "VALUES (?, ?, ?, 'queued', 0, ?, ?)",
            (job_id, series_id, job_type, now, now),
        )
        connection.commit()
    finally:
        connection.close()
    return job_id
