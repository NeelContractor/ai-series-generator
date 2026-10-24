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


def _create_planned_series(
    client: TestClient, episode_count: int = 4
) -> tuple[str, list[dict]]:
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
    plan_job = wait_for_job(client, planned.json()["job_id"])
    assert plan_job["status"] == "succeeded"
    episodes = client.get(f"/series/{series_id}/episodes").json()
    assert len(episodes) == episode_count
    return series_id, episodes


def _lock_series(client: TestClient, series_id: str) -> None:
    locked = client.post(f"/series/{series_id}/bible/lock")
    assert locked.status_code == 200


def _create_storyboard(client: TestClient, series_id: str) -> dict:
    generated = client.post(f"/series/{series_id}/storyboard")
    assert generated.status_code == 202
    job = wait_for_job(client, generated.json()["job_id"])
    assert job["status"] == "succeeded"
    storyboard = client.get(f"/series/{series_id}/storyboard")
    assert storyboard.status_code == 200
    return storyboard.json()


def test_outline_qa_flags_hook_repeat_escalation_and_finale(
    client: TestClient,
) -> None:
    series_id, episodes = _create_planned_series(client, 4)

    assert (
        client.patch(
            f"/episodes/{episodes[0]['id']}",
            json={"hook_type": "betrayal"},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/episodes/{episodes[1]['id']}",
            json={"hook_type": "betrayal"},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/episodes/{episodes[3]['id']}",
            json={"summary": "They leave the library and never look back."},
        ).status_code
        == 200
    )

    validation = client.post(f"/series/{series_id}/validate")
    assert validation.status_code == 200
    body = validation.json()
    assert body["valid"] is False
    codes = {issue["code"] for issue in body["issues"]}
    assert "consecutive_hook_repeat" in codes
    assert "finale_missing_resolution" in codes

    assert (
        client.patch(
            f"/episodes/{episodes[3]['id']}",
            json={
                "hook_type": "betrayal",
                "hook_description": "Cut to black.",
            },
        ).status_code
        == 200
    )
    validation = client.post(f"/series/{series_id}/validate")
    codes = {issue["code"] for issue in validation.json()["issues"]}
    assert "finale_has_hook" in codes

    assert (
        client.patch(
            f"/episodes/{episodes[0]['id']}",
            json={"hook_type": "unanswered_question"},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/episodes/{episodes[1]['id']}",
            json={"hook_type": "shocking_reveal"},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/episodes/{episodes[3]['id']}",
            json={
                "summary": "The story concludes and the main arcs resolve.",
                "hook_type": None,
                "hook_description": None,
            },
        ).status_code
        == 200
    )

    validation = client.post(f"/series/{series_id}/validate")
    assert validation.json()["valid"] is True
    assert validation.json()["issues"] == []


def test_outline_qa_flags_non_escalating_hooks(client: TestClient) -> None:
    series_id, episodes = _create_planned_series(client, 4)

    assert (
        client.patch(
            f"/episodes/{episodes[0]['id']}",
            json={"hook_type": "impossible_choice"},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/episodes/{episodes[1]['id']}",
            json={"hook_type": "unanswered_question"},
        ).status_code
        == 200
    )

    validation = client.post(f"/series/{series_id}/validate")
    codes = {issue["code"] for issue in validation.json()["issues"]}
    assert "hook_escalation" in codes


def test_content_moderation_blocks_script_episode_and_shot_text(
    client: TestClient,
) -> None:
    blocked = client.post(
        "/series",
        json={
            "title": "Unsafe",
            "script": "A villain explains how to build a pipe bomb.",
            "tone": "thriller",
            "episode_length": 3,
            "episode_count": 4,
        },
    )
    assert blocked.status_code == 422
    detail = blocked.json()["detail"]
    assert detail["field"] == "script"
    assert detail["issues"][0]["category"] == "weapons_instructions"

    series_id, episodes = _create_planned_series(client, 4)
    blocked_episode = client.patch(
        f"/episodes/{episodes[0]['id']}",
        json={"summary": "A guide on how to build a bomb."},
    )
    assert blocked_episode.status_code == 422
    assert blocked_episode.json()["detail"]["field"] == "episode outline"

    _lock_series(client, series_id)
    storyboard = _create_storyboard(client, series_id)
    target = storyboard["episodes"][0]["scenes"][0]["shots"][0]
    blocked_shot = client.patch(
        f"/shots/{target['id']}",
        json={"prompt": "A guide on how to build a pipe bomb."},
    )
    assert blocked_shot.status_code == 422
    assert blocked_shot.json()["detail"]["field"] == "shot prompt"


def test_cliffhanger_prompts_enforce_final_hook_window(
    client: TestClient,
) -> None:
    series_id, episodes = _create_planned_series(client, 4)
    assert (
        client.patch(
            f"/episodes/{episodes[0]['id']}",
            json={"hook_description": "Cut to black on Alice's scream."},
        ).status_code
        == 200
    )
    _lock_series(client, series_id)

    storyboard = _create_storyboard(client, series_id)
    first_episode = storyboard["episodes"][0]
    cliffhanger_scene = next(
        scene
        for scene in first_episode["scenes"]
        if scene["title"] == "Cliffhanger"
    )
    assert cliffhanger_scene["shots"]
    for shot in cliffhanger_scene["shots"]:
        assert "last 10-15 seconds" in shot["prompt"].lower()
