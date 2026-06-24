from __future__ import annotations

import json
import os
from pathlib import Path
from urllib import request


ROOT = Path("/home/ubuntu/lotto-play-picker")
SOURCE = ROOT / "data" / "pension720Draws.json"
ENV_FILES = [ROOT / ".env.local", ROOT / ".env"]


def load_local_env() -> None:
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue

        for line in env_file.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue

            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def main() -> None:
    load_local_env()

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    supabase_key = os.getenv("SUPABASE_SECRET_KEY", "") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        raise RuntimeError("Missing Supabase environment variables.")

    rows = json.loads(SOURCE.read_text(encoding="utf-8"))
    payload = json.dumps(
        [
            {
                "draw_no": row["drawNo"],
                "draw_group": row["group"],
                "winning_number": row["winningNumber"],
                "digits": row["digits"],
                "draw_date": None,
            }
            for row in rows
        ]
    ).encode("utf-8")

    req = request.Request(
        f"{supabase_url}/rest/v1/pension720_draws?on_conflict=draw_no",
        data=payload,
        method="POST",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
    )
    with request.urlopen(req, timeout=60) as response:
        body = response.read().decode("utf-8")
        print(body[:500])


if __name__ == "__main__":
    main()
