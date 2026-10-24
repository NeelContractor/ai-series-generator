import json
import os
import sys
import tempfile
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))
_OPENAPI_MEDIA_DIR = tempfile.TemporaryDirectory(
    prefix="ai-series-openapi-"
)
os.environ["MEDIA_DIR"] = _OPENAPI_MEDIA_DIR.name

from app.main import app  # noqa: E402

REPO_ROOT = API_DIR.parents[1]
OUTPUT_PATH = REPO_ROOT / "packages" / "api-client" / "openapi.json"


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
