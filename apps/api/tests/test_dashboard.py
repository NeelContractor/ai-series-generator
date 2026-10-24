from fastapi.testclient import TestClient

from tests.helpers import insert_queued_job


def test_dashboard_aggregates_series_and_jobs(client: TestClient) -> None:
    created = client.post(
        "/series",
        json={
            "title": "Dashboard Test",
            "script": "INT. ROOM - DAY\n\nMARA: Hello.\nJONAS: Hi.",
            "tone": "thriller",
            "episode_length": 3,
        },
    )
    assert created.status_code == 201
    series = created.json()
    job_id = insert_queued_job(series["id"], "render")

    response = client.get("/dashboard")
    assert response.status_code == 200
    body = response.json()

    assert body["counts"]["active_series"] >= 1
    assert body["counts"]["render_queue"] >= 1
    assert body["counts"]["credits_remaining"] is None
    assert any(
        item["id"] == series["id"] for item in body["recent_series"]
    )
    assert body["current_production"] is not None
    assert "series" in body["current_production"]
    assert len(body["render_activity"]) == 7
    assert any(job["id"] == job_id for job in body["active_jobs"])
    assert any(
        job["series_title"] == "Dashboard Test"
        for job in body["active_jobs"]
    )
