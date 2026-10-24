import json
import os
import sqlite3

from fastapi.testclient import TestClient

from tests.helpers import wait_for_job

SCRIPT = """INT. COFFEE SHOP - DAY

ALICE: We need to talk.
BOB: About the money?
ALICE: About everything.

EPISODE 1: The Meeting

INT. OFFICE - NIGHT
CAROL: He knows.
BOB: Then we move tonight.

EPISODE 2: The Fallout

EXT. PARK - NIGHT
ALICE: You lied to me.
CAROL: I had no choice.
BOB: It's not what it looks like.
ALICE: Then tell me the truth.
"""


def _create_approved_series(client: TestClient) -> tuple[str, dict]:
    created = client.post(
        "/series",
        json={
            "title": "The Meeting",
            "script": SCRIPT,
            "tone": "thriller",
            "episode_length": 3,
            "episode_count": 4,
        },
    )
    assert created.status_code == 201
    series_id = created.json()["id"]

    assert client.post(f"/series/{series_id}/analyze").status_code == 202
    questions = client.get(f"/series/{series_id}/questions").json()
    assert (
        client.post(
            f"/series/{series_id}/answers",
            json={
                "answers": [
                    {"question_id": question["id"], "value": "auto"}
                    for question in questions
                ]
            },
        ).status_code
        == 200
    )
    planned = client.post(f"/series/{series_id}/plan")
    assert planned.status_code == 202
    assert wait_for_job(client, planned.json()["job_id"])["status"] == "succeeded"
    assert client.post(f"/series/{series_id}/bible/lock").status_code == 200

    generated = client.post(f"/series/{series_id}/storyboard")
    assert generated.status_code == 202
    generated_job = wait_for_job(client, generated.json()["job_id"])
    assert generated_job["status"] == "succeeded"
    storyboard = client.get(f"/series/{series_id}/storyboard").json()

    approved = client.post(f"/series/{series_id}/storyboard/approve")
    assert approved.status_code == 200
    assert client.get(f"/series/{series_id}").json()["state"] == "APPROVED"
    return series_id, storyboard


def _flatten_shots(storyboard: dict) -> list[dict]:
    return [
        shot
        for episode in storyboard["episodes"]
        for scene in episode["scenes"]
        for shot in scene["shots"]
    ]


def _sse_payloads(body: str) -> list[dict]:
    payloads = []
    for line in body.splitlines():
        if line.startswith("data: "):
            payloads.append(json.loads(line[len("data: ") :]))
    return payloads


def test_render_and_delivery_flow(client: TestClient) -> None:
    series_id, storyboard = _create_approved_series(client)
    shots = _flatten_shots(storyboard)

    started = client.post(f"/series/{series_id}/render")
    assert started.status_code == 202
    start_body = started.json()
    assert start_body["type"] == "render"
    assert start_body["series_id"] == series_id
    assert start_body["shot_count"] == 36
    assert start_body["episode_count"] == 4
    assert start_body["status"] == "queued"
    assert started.headers["location"] == f"/jobs/{start_body['job_id']}"

    render_job = wait_for_job(client, start_body["job_id"])
    assert render_job["status"] == "succeeded"
    assert render_job["result"]["run_id"] == start_body["run_id"]
    assert render_job["result"]["episode_count"] == 4

    assert client.get(f"/series/{series_id}").json()["state"] == "DONE"

    render_status = client.get(f"/series/{series_id}/render")
    assert render_status.status_code == 200
    assert render_status.json()["status"] == "succeeded"
    assert render_status.json()["progress"] == 1.0

    events = client.get(f"/series/{series_id}/events")
    assert events.status_code == 200
    assert events.headers["content-type"].startswith("text/event-stream")
    assert "event: progress" in events.text
    assert "event: done" in events.text

    payloads = _sse_payloads(events.text)
    assert payloads
    final = payloads[-1]
    assert final["status"] == "succeeded"
    assert final["progress"] == 1.0
    assert final["shot_count"] == 36
    assert final["episode_count"] == 4
    assert all(shot["status"] == "rendered" for shot in final["shots"])
    assert all(
        episode["status"] == "assembled" for episode in final["episodes"]
    )
    assert all(shot["asset_url"] for shot in final["shots"])

    for episode_number in range(1, 5):
        video = client.get(
            f"/series/{series_id}/episodes/{episode_number}/video"
        )
        assert video.status_code == 200
        video_body = video.json()
        assert video_body["video_url"].startswith("/media/")
        assert video_body["format"] == "animated_svg"
        assert video_body["duration_seconds"] > 0

        asset = client.get(video_body["video_url"])
        assert asset.status_code == 200
        assert asset.headers["content-type"].startswith("image/svg+xml")
        assert f"EPISODE {episode_number}" in asset.text
        assert "<animate" in asset.text
        assert "data:image/svg+xml;base64," in asset.text
        assert 'href="/media/' not in asset.text

    assert client.post(f"/series/{series_id}/render").status_code == 409
    assert client.post(f"/shots/{shots[0]['id']}/retry").status_code == 409
    assert (
        client.get(f"/series/{series_id}/episodes/99/video").status_code == 404
    )


def test_retry_failed_shot(client: TestClient) -> None:
    series_id, storyboard = _create_approved_series(client)
    target = _flatten_shots(storyboard)[0]

    assert client.post(f"/series/{series_id}/render").status_code == 202

    _mark_shot_failed(target["id"])

    retried = client.post(f"/shots/{target['id']}/retry")
    assert retried.status_code == 202
    retried_body = retried.json()
    assert retried_body["type"] == "shot_retry"
    assert retried_body["shot_id"] == target["id"]
    assert retried_body["status"] == "queued"
    assert retried_body["attempt"] == 2
    assert retried.headers["location"] == f"/jobs/{retried_body['job_id']}"

    retry_job = wait_for_job(client, retried_body["job_id"])
    assert retry_job["status"] == "succeeded"

    events = client.get(f"/series/{series_id}/events")
    final = _sse_payloads(events.text)[-1]
    assert final["status"] == "succeeded"
    target_state = next(
        shot for shot in final["shots"] if shot["shot_id"] == target["id"]
    )
    assert target_state["status"] == "rendered"
    assert target_state["attempts"] == 2

    assert client.get(f"/series/{series_id}").json()["state"] == "DONE"
    assert (
        client.get(f"/series/{series_id}/episodes/1/video").status_code == 200
    )

    assert client.post(f"/shots/{target['id']}/retry").status_code == 409


def test_render_gates(client: TestClient) -> None:
    created = client.post(
        "/series",
        json={
            "script": SCRIPT,
            "tone": "thriller",
            "episode_length": 3,
            "episode_count": 4,
        },
    )
    series_id = created.json()["id"]

    assert client.post(f"/series/{series_id}/render").status_code == 409
    assert client.get(f"/series/{series_id}/events").status_code == 409
    assert client.get(f"/series/{series_id}/render").status_code == 404
    assert (
        client.get(f"/series/{series_id}/episodes/1/video").status_code == 404
    )


def _mark_shot_failed(shot_id: str) -> None:
    database_url = os.environ["DATABASE_URL"]
    database_path = database_url.split("///", 1)[1]
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "UPDATE shot_renders SET status = 'failed' WHERE shot_id = ?",
            (shot_id,),
        )
        connection.commit()
    finally:
        connection.close()
