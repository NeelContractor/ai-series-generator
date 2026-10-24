import os
import tempfile
import uuid

os.environ["DATABASE_URL"] = (
    f"sqlite+aiosqlite:///{tempfile.gettempdir()}/ai-series-api-{uuid.uuid4().hex}.db"
)
os.environ["MEDIA_DIR"] = tempfile.mkdtemp(prefix="ai-series-media-")
os.environ["RENDER_STEP_DELAY_SECONDS"] = "0"
os.environ["SSE_POLL_INTERVAL_SECONDS"] = "0.01"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
