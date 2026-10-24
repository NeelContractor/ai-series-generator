from fastapi.testclient import TestClient

from tests.helpers import insert_queued_job, wait_for_job

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


def _create_analyzed_series(
    client: TestClient, episode_count: int | None = 6
) -> str:
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

    analyzed = client.post(f"/series/{series_id}/analyze")
    assert analyzed.status_code == 202
    analyze_job = wait_for_job(client, analyzed.json()["job_id"])
    assert analyze_job["type"] == "analyze"
    assert analyze_job["status"] == "succeeded"
    assert client.get(f"/series/{series_id}").json()["state"] == "ANALYZED"
    return series_id


def test_questions_to_locked_bible_flow(client: TestClient) -> None:
    series_id = _create_analyzed_series(client)

    questions_response = client.get(f"/series/{series_id}/questions")
    assert questions_response.status_code == 200
    questions = questions_response.json()
    assert questions

    categories = {question["category"] for question in questions}
    assert {
        "character_appearance",
        "location_look",
        "visual_style",
        "wardrobe",
        "voice",
        "music_mood",
        "aspect_ratio",
    } <= categories
    for question in questions:
        assert any(
            option["is_auto_decide"] for option in question["options"]
        )
        assert question["answered"] is False

    assert client.get(f"/series/{series_id}").json()["state"] == "QUESTIONS"

    answers = [
        {
            "question_id": question["id"],
            "value": (
                "A weathered detective in a long coat"
                if index == 0
                else "auto"
            ),
        }
        for index, question in enumerate(questions)
    ]
    answered = client.post(
        f"/series/{series_id}/answers", json={"answers": answers}
    )
    assert answered.status_code == 200
    assert all(question["answered"] for question in answered.json())

    count = client.get(f"/series/{series_id}/episode-count")
    assert count.status_code == 200
    count_body = count.json()
    assert count_body["episode_count"] == 6
    assert count_body["source"] == "user"
    assert count_body["range_min"] == 4
    assert count_body["range_max"] == 10
    assert 4 <= count_body["suggested_count"] <= 10

    too_low = client.put(
        f"/series/{series_id}/episode-count", json={"episode_count": 2}
    )
    assert too_low.status_code == 200
    assert too_low.json()["warning"] is not None

    restored = client.put(
        f"/series/{series_id}/episode-count", json={"episode_count": 6}
    )
    assert restored.status_code == 200
    assert restored.json()["source"] == "user"
    assert restored.json()["warning"] is None

    planned = client.post(f"/series/{series_id}/plan")
    assert planned.status_code == 202
    plan_body = planned.json()
    assert plan_body["type"] == "plan"
    assert planned.headers["location"] == f"/jobs/{plan_body['job_id']}"
    plan_job = wait_for_job(client, plan_body["job_id"])
    assert plan_job["status"] == "succeeded"
    assert plan_job["result"]["episode_count"] == 6

    episodes = client.get(f"/series/{series_id}/episodes").json()
    assert len(episodes) == 6
    assert [episode["number"] for episode in episodes] == [1, 2, 3, 4, 5, 6]

    for episode in episodes[:-1]:
        assert episode["ending_type"] == "cliffhanger"
        assert episode["hook_type"]
        assert episode["hook_description"]
    assert episodes[-1]["ending_type"] == "conclusion"
    assert episodes[-1]["hook_type"] is None

    hook_types = [episode["hook_type"] for episode in episodes[:-1]]
    assert all(
        left != right for left, right in zip(hook_types, hook_types[1:])
    )

    listed = client.get(f"/series/{series_id}/episodes")
    assert listed.status_code == 200
    assert len(listed.json()) == 6

    validation = client.post(f"/series/{series_id}/validate")
    assert validation.status_code == 200
    assert validation.json()["valid"] is True
    assert validation.json()["issues"] == []

    patched = client.patch(
        f"/episodes/{episodes[0]['id']}",
        json={
            "title": "Episode 1: The Confession",
            "hook_description": "Cut to black on Alice's scream.",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Episode 1: The Confession"
    assert patched.json()["hook_description"] == "Cut to black on Alice's scream."

    locked = client.post(f"/series/{series_id}/bible/lock")
    assert locked.status_code == 200
    bible = locked.json()
    assert bible["locked"] is True
    assert bible["series_id"] == series_id
    assert len(bible["episodes"]) == 6
    assert bible["style"]["aspect_ratio"]["value"] == "9:16"
    assert bible["characters"][0]["appearance"]["value"] == (
        "A weathered detective in a long coat"
    )

    assert client.get(f"/series/{series_id}").json()["state"] == "BIBLE_LOCKED"

    fetched = client.get(f"/series/{series_id}/bible")
    assert fetched.status_code == 200
    assert fetched.json()["locked_at"] == bible["locked_at"]
    assert fetched.json()["episodes"][0]["title"] == "Episode 1: The Confession"

    assert client.post(f"/series/{series_id}/bible/lock").status_code == 409
    assert (
        client.patch(
            f"/episodes/{episodes[0]['id']}",
            json={"hook_description": "Late edit"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/series/{series_id}/answers",
            json={"answers": [{"question_id": questions[0]["id"], "value": "auto"}]},
        ).status_code
        == 409
    )
    assert client.post(f"/series/{series_id}/plan").status_code == 409
    assert (
        client.put(
            f"/series/{series_id}/episode-count", json={"episode_count": 5}
        ).status_code
        == 409
    )


def test_duplicate_active_job_is_rejected(client: TestClient) -> None:
    series_id = _create_analyzed_series(client)
    job_id = insert_queued_job(series_id, "plan")

    queued = client.get(f"/jobs/{job_id}")
    assert queued.status_code == 200
    assert queued.json()["status"] == "queued"
    assert queued.json()["type"] == "plan"

    blocked = client.post(f"/series/{series_id}/plan")
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == {
        "message": "A plan job is already in progress",
        "job_id": job_id,
    }


def test_validation_flags_bad_outline_and_blocks_lock(client: TestClient) -> None:
    series_id = _create_analyzed_series(client, episode_count=4)

    planned = client.post(f"/series/{series_id}/plan")
    assert planned.status_code == 202
    plan_job = wait_for_job(client, planned.json()["job_id"])
    assert plan_job["status"] == "succeeded"

    episodes = client.get(f"/series/{series_id}/episodes").json()
    assert len(episodes) == 4

    finale = episodes[-1]
    patched = client.patch(
        f"/episodes/{finale['id']}", json={"ending_type": "cliffhanger"}
    )
    assert patched.status_code == 200

    validation = client.post(f"/series/{series_id}/validate")
    assert validation.status_code == 200
    assert validation.json()["valid"] is False
    codes = {issue["code"] for issue in validation.json()["issues"]}
    assert "finale_not_conclusion" in codes

    locked = client.post(f"/series/{series_id}/bible/lock")
    assert locked.status_code == 409
    assert locked.json()["detail"]["message"].startswith(
        "Bible cannot be locked"
    )

    first = episodes[0]
    client.patch(
        f"/episodes/{first['id']}",
        json={"ending_type": "conclusion", "hook_type": None},
    )
    validation = client.post(f"/series/{series_id}/validate")
    codes = {issue["code"] for issue in validation.json()["issues"]}
    assert "missing_cliffhanger" in codes
    assert "missing_hook_type" in codes
