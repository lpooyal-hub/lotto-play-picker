#!/usr/bin/env python3
"""
Export Lotto history for the static frontend.

Usage:
    python3 export_history.py --history 300

Output:
    frontend/lotto_history.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from lotto_picker import fetch_history


ROOT = Path(__file__).resolve().parent
DEFAULT_OUTPUT = ROOT / "frontend" / "lotto_history.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Lotto history JSON for the frontend.")
    parser.add_argument("--history", type=int, default=300, help="recent draw count to export")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="output JSON path")
    args = parser.parse_args()

    draws = fetch_history(limit=args.history)
    payload = {
        "source": "dhlottery",
        "count": len(draws),
        "firstDraw": draws[0].draw_no,
        "latestDraw": draws[-1].draw_no,
        "draws": [
            {
                "drawNo": draw.draw_no,
                "numbers": list(draw.numbers),
                "bonus": draw.bonus,
            }
            for draw in draws
        ],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(draws)} draws to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
