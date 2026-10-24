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


def _create_locked_series(client: TestClient, episode_count: int = 4) -> str:
    created = client.post(
        "/series",
        json={
            "title": "The Meeting",
            "script": SCRIPT,
            "tone": "thriller",
            "episode_length": 3,
            "episode_count": episode_count,
        },
    )
    assert created.status_code == 201
    series_id = created.json()["id"]

    assert client.post(f"/series/{series_id}/analyze").status_code == 202

    questions = client.get(f"/series/{series_id}/questions").json()
    answers = [
        {"question_id": question["id"], "value": "auto"}
        for question in questions
    ]
    assert (
        client.post(
            f"/series/{series_id}/answers", json={"answers": answers}
        ).status_code
        == 200
    )

    planned = client.post(f"/series/{series_id}/plan")
    assert planned.status_code == 202
    plan_job = wait_for_job(client, planned.json()["job_id"])
    assert plan_job["status"] == "succeeded"
    assert client.post(f"/series/{series_id}/bible/lock").status_code == 200
    assert client.get(f"/series/{series_id}").json()["state"] == "BIBLE_LOCKED"
    return series_id


def _flatten_shots(storyboard: dict) -> list[dict]:
    return [
        shot
        for episode in storyboard["episodes"]
        for scene in episode["scenes"]
        for shot in scene["shots"]
    ]


def test_storyboard_cost_gate_flow(client: TestClient) -> None:
    series_id = _create_locked_series(client)

    generated = client.post(f"/series/{series_id}/storyboard")
    assert generated.status_code == 202
    generated_body = generated.json()
    assert generated_body["type"] == "storyboard"
    assert generated.headers["location"] == f"/jobs/{generated_body['job_id']}"
    storyboard_job = wait_for_job(client, generated_body["job_id"])
    assert storyboard_job["status"] == "succeeded"
    assert storyboard_job["result"]["shot_count"] == 36

    storyboard_response = client.get(f"/series/{series_id}/storyboard")
    assert storyboard_response.status_code == 200
    storyboard = storyboard_response.json()
    assert storyboard["series_id"] == series_id
    assert storyboard["approved"] is False
    assert len(storyboard["references"]) > 0
    assert {reference["kind"] for reference in storyboard["references"]} == {
        "character",
        "location",
    }
    assert len(storyboard["episodes"]) == 4
    for episode in storyboard["episodes"]:
        assert len(episode["scenes"]) == 3
        for scene in episode["scenes"]:
            assert len(scene["shots"]) == 3

    shots = _flatten_shots(storyboard)
    assert len(shots) == 36
    reference_ids = {reference["id"] for reference in storyboard["references"]}
    for shot in shots:
        assert shot["keyframe_url"].startswith("/media/")
        assert shot["status"] == "ready"
        assert shot["version"] == 1
        assert set(shot["references"]) <= reference_ids

    assert client.get(f"/series/{series_id}").json()["state"] == "STORYBOARD"

    keyframe = client.get(shots[0]["keyframe_url"])
    assert keyframe.status_code == 200
    assert keyframe.headers["content-type"].startswith("image/svg+xml")

    reference_image = client.get(storyboard["references"][0]["image_url"])
    assert reference_image.status_code == 200

    listed = client.get(f"/series/{series_id}/storyboard")
    assert listed.status_code == 200
    assert len(_flatten_shots(listed.json())) == 36

    estimate = client.get(f"/series/{series_id}/estimate")
    assert estimate.status_code == 200
    estimate_body = estimate.json()
    assert estimate_body["shot_count"] == 36
    assert estimate_body["episode_count"] == 4
    assert estimate_body["estimated_cost_usd"] == 0.0
    assert estimate_body["estimated_render_seconds"] > 0
    assert estimate_body["total_shot_seconds"] == sum(
        shot["duration_seconds"] for shot in shots
    )
    assert len(estimate_body["breakdown"]) == 3

    target = shots[0]
    patched = client.patch(
        f"/shots/{target['id']}",
        json={
            "prompt": "Close-up on Alice as she realizes the betrayal.",
            "duration_seconds": 8,
            "references": [storyboard["references"][0]["id"]],
        },
    )
    assert patched.status_code == 200
    patched_body = patched.json()
    assert patched_body["prompt"].startswith("Close-up on Alice")
    assert patched_body["duration_seconds"] == 8
    assert patched_body["references"] == [storyboard["references"][0]["id"]]

    invalid = client.patch(
        f"/shots/{target['id']}", json={"references": ["missing-reference"]}
    )
    assert invalid.status_code == 422

    estimate_after = client.get(f"/series/{series_id}/estimate").json()
    assert estimate_after["total_shot_seconds"] == (
        estimate_body["total_shot_seconds"]
        - target["duration_seconds"]
        + 8
    )

    other = shots[1]
    regenerated = client.post(f"/shots/{target['id']}/regenerate")
    assert regenerated.status_code == 200
    regenerated_body = regenerated.json()
    assert regenerated_body["version"] == 2
    assert regenerated_body["keyframe_url"] != target["keyframe_url"]
    assert regenerated_body["prompt"] == patched_body["prompt"]

    other_after = client.get(f"/series/{series_id}/storyboard").json()
    other_shot = next(
        shot for shot in _flatten_shots(other_after) if shot["id"] == other["id"]
    )
    assert other_shot["keyframe_url"] == other["keyframe_url"]
    assert other_shot["version"] == 1

    versions = client.get(f"/shots/{target['id']}/versions")
    assert versions.status_code == 200
    versions_body = versions.json()
    assert [version["version"] for version in versions_body] == [2, 1]
    assert versions_body[0]["keyframe_url"] == regenerated_body["keyframe_url"]
    assert versions_body[1]["keyframe_url"] == target["keyframe_url"]

    approved = client.post(f"/series/{series_id}/storyboard/approve")
    assert approved.status_code == 200
    approved_body = approved.json()
    assert approved_body["approved"] is True
    assert approved_body["shot_count"] == 36
    assert approved_body["estimated_cost_usd"] == 0.0
    assert approved_body["estimated_render_seconds"] > 0

    assert client.get(f"/series/{series_id}").json()["state"] == "APPROVED"
    assert client.get(f"/series/{series_id}/storyboard").json()["approved"] is True

    assert client.post(f"/shots/{target['id']}/regenerate").status_code == 409
    assert (
        client.patch(
            f"/shots/{target['id']}", json={"duration_seconds": 5}
        ).status_code
        == 409
    )
    assert client.post(f"/series/{series_id}/storyboard").status_code == 409
    assert client.post(f"/series/{series_id}/storyboard/approve").status_code == 409


def test_storyboard_gates_before_bible_and_storyboard(client: TestClient) -> None:
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

    assert client.post(f"/series/{series_id}/storyboard").status_code == 409
    assert client.get(f"/series/{series_id}/storyboard").status_code == 404
    assert client.get(f"/series/{series_id}/estimate").status_code == 409
    assert client.post(f"/series/{series_id}/storyboard/approve").status_code == 409

    assert client.post(f"/series/{series_id}/analyze").status_code == 202
    assert client.post(f"/series/{series_id}/storyboard").status_code == 409
    assert client.get(f"/series/{series_id}/estimate").status_code == 409
