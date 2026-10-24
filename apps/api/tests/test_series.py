from fastapi.testclient import TestClient

from tests.helpers import insert_queued_job

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

TREATMENT_SCRIPT = """LOGLINE: A night-shift librarian finds a letter in her late father's handwriting and is pulled into a mystery about stolen research.

CHARACTERS
- Riya Mehta, 24. Night-shift librarian. Short black bob, round glasses, olive green cardigan. Curious, stubborn, soft-spoken.
- Kabir Shah, 27. Freelance journalist and Riya's old friend. Stubble, denim jacket, canvas messenger bag. Charming, evasive.
- Mr. Desai, 62. Head librarian. Grey moustache, brown suit, pocket watch. Polite, controlling, secretive.

LOCATIONS
- Old City Library: dusty, brass lamps, tall wooden shelves, quiet at night.
- Library basement archive: cold, flickering bulbs, locked metal shelves.
- Tea stall outside: neon sign, steam, rain on the street.

EPISODES
1. "The Letter": Riya finds a letter inside a returned book: "Shelf 13. Trust no one." Handwriting matches her father's, who died three years ago.
   Ending: the letter is dated yesterday.
2. "Shelf 13": Riya and Kabir sneak into the basement and find her father's research notebooks. One is missing.
   Ending: a hidden photo shows Mr. Desai standing beside her father, years before he claimed to know him.
3. "The Missing Notebook": Desai starts watching Riya closely. She follows a clue to the tea stall.
   Ending: she sees Kabir handing Desai a photo of her.
4. "Closing Time": Kabir reveals he is a double agent who wrote the letter to get Riya to the notebooks safely. Together they expose Desai, and her father's name is restored.
   Ending: story concludes. Riya becomes head librarian and places her father's notebook on Shelf 13.
"""


def test_series_analysis_flow(client: TestClient) -> None:
    created = client.post(
        "/series",
        json={
            "title": "The Meeting",
            "script": SCRIPT,
            "tone": "thriller",
            "episode_length": 3,
            "episode_count": 6,
        },
    )
    assert created.status_code == 201
    series = created.json()
    series_id = series["id"]
    assert series["state"] == "UPLOADED"
    assert series["episode_count_source"] == "user"

    listed = client.get("/series")
    assert listed.status_code == 200
    assert series_id in [item["id"] for item in listed.json()]

    detail = client.get(f"/series/{series_id}")
    assert detail.status_code == 200
    assert detail.json()["title"] == "The Meeting"

    started = client.post(f"/series/{series_id}/analyze")
    assert started.status_code == 202
    job_id = started.json()["job_id"]

    job = client.get(f"/jobs/{job_id}")
    assert job.status_code == 200
    assert job.json()["status"] == "succeeded"
    assert job.json()["progress"] == 1.0
    assert job.json()["result"]["completeness_score"] > 0

    analysis = client.get(f"/series/{series_id}/analysis")
    assert analysis.status_code == 200
    body = analysis.json()
    character_names = {
        character["name"] for character in body["characters"]
    }
    assert character_names >= {
        "ALICE",
        "BOB",
        "CAROL",
    }
    assert not any(name.upper().startswith("EPISODE ") for name in character_names)
    assert {location["name"] for location in body["locations"]} >= {
        "COFFEE SHOP",
        "OFFICE",
        "PARK",
    }
    assert len(body["arcs"]) == 2
    assert 0 < body["completeness"]["score"] <= 100

    analyzed = client.get(f"/series/{series_id}")
    assert analyzed.json()["state"] == "ANALYZED"


def test_missing_resources_return_404(client: TestClient) -> None:
    assert client.get("/series/unknown").status_code == 404
    assert client.get("/jobs/unknown").status_code == 404

    created = client.post(
        "/series",
        json={
            "script": "A short script without much detail.",
            "tone": "drama",
            "episode_length": 1,
        },
    )
    series_id = created.json()["id"]
    assert client.get(f"/series/{series_id}/analysis").status_code == 404


def test_delete_series_removes_related_records(client: TestClient) -> None:
    created = client.post(
        "/series",
        json={
            "script": "INT. ROOM - DAY\n\nALICE: Hello.",
            "tone": "drama",
            "episode_length": 1,
        },
    )
    assert created.status_code == 201
    series_id = created.json()["id"]

    job_id = insert_queued_job(series_id, "render")

    deleted = client.delete(f"/series/{series_id}")
    assert deleted.status_code == 204

    assert client.get(f"/series/{series_id}").status_code == 404
    assert client.get(f"/jobs/{job_id}").status_code == 404
    assert series_id not in [item["id"] for item in client.get("/series").json()]

    assert client.delete(f"/series/{series_id}").status_code == 404


def test_structured_treatment_analysis(client: TestClient) -> None:
    created = client.post(
        "/series",
        json={
            "title": "Shelf 13",
            "script": TREATMENT_SCRIPT,
            "tone": "mystery",
            "episode_length": 3,
            "episode_count": 4,
        },
    )
    assert created.status_code == 201
    series_id = created.json()["id"]

    started = client.post(f"/series/{series_id}/analyze")
    assert started.status_code == 202

    analysis = client.get(f"/series/{series_id}/analysis")
    assert analysis.status_code == 200
    body = analysis.json()

    characters = {item["name"]: item for item in body["characters"]}
    assert set(characters) == {"Riya Mehta", "Kabir Shah", "Mr. Desai"}
    assert "Short black bob" in characters["Riya Mehta"]["description"]
    assert "double agent" not in characters["Kabir Shah"]["description"]

    locations = {item["name"]: item for item in body["locations"]}
    assert set(locations) == {
        "Old City Library",
        "Library basement archive",
        "Tea stall outside",
    }
    assert "brass lamps" in locations["Old City Library"]["description"]

    assert [arc["title"] for arc in body["arcs"]] == [
        "Episode 1: The Letter",
        "Episode 2: Shelf 13",
        "Episode 3: The Missing Notebook",
        "Episode 4: Closing Time",
    ]
    assert "dated yesterday" in body["arcs"][0]["summary"]
    assert "photo of her" in body["arcs"][2]["summary"]
    assert body["completeness"]["signals"]["arc_count"] == 4
    assert body["completeness"]["signals"]["dialogue_line_count"] == 0
    assert body["completeness"]["missing"] == []
    assert body["completeness"]["score"] >= 80
