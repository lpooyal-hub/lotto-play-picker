#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"
XLSX_FILE = ROOT / "lotto.xlsx"
SUPABASE_TABLE_URL_TEMPLATE = "{base}/rest/v1/lotto_draws?on_conflict=draw_no"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def load_shared_strings(xlsx_path: Path) -> list[str]:
    with zipfile.ZipFile(xlsx_path) as archive:
        if "xl/sharedStrings.xml" not in archive.namelist():
            return []

        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        strings: list[str] = []
        for item in root.findall(f"{NS}si"):
            strings.append("".join(node.text or "" for node in item.iter(f"{NS}t")))
        return strings


def get_first_sheet_target(xlsx_path: Path) -> str:
    with zipfile.ZipFile(xlsx_path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        first_sheet = workbook.find(f"{NS}sheets")[0]
        return "xl/" + rel_map[first_sheet.attrib[f"{REL_NS}id"]]


def read_lotto_rows(xlsx_path: Path) -> list[dict]:
    shared_strings = load_shared_strings(xlsx_path)
    sheet_target = get_first_sheet_target(xlsx_path)

    with zipfile.ZipFile(xlsx_path) as archive:
        root = ET.fromstring(archive.read(sheet_target))
        rows = root.find(f"{NS}sheetData")
        parsed_rows = []

        for index, row in enumerate(rows.findall(f"{NS}row")):
            values = []
            for cell in row.findall(f"{NS}c"):
                cell_type = cell.attrib.get("t")
                node = cell.find(f"{NS}v")
                value = node.text if node is not None else ""
                if cell_type == "s" and value:
                    value = shared_strings[int(value)]
                values.append(value)

            if index == 0:
                continue
            if not values or not values[0]:
                continue

            parsed_rows.append(
                {
                    "draw_no": int(values[0]),
                    "numbers": [int(values[i]) for i in range(1, 7)],
                    "bonus_number": int(values[7]),
                    "draw_date": None,
                }
            )

        return parsed_rows


def chunked(items: list[dict], size: int) -> list[list[dict]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def upsert_rows(base_url: str, service_key: str, rows: list[dict]) -> None:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    url = SUPABASE_TABLE_URL_TEMPLATE.format(base=base_url.rstrip("/"))

    for batch in chunked(rows, 250):
        request = urllib.request.Request(
            url,
            data=json.dumps(batch).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status >= 400:
                    raise RuntimeError(f"Supabase upsert failed: HTTP {response.status}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase upsert failed: HTTP {exc.code} {body[:300]}") from exc


def main() -> int:
    if not ENV_FILE.exists():
        print(f"Missing env file: {ENV_FILE}", file=sys.stderr)
        return 1

    if not XLSX_FILE.exists():
        print(f"Missing xlsx file: {XLSX_FILE}", file=sys.stderr)
        return 1

    env = read_env_file(ENV_FILE)
    base_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    service_key = env.get("SUPABASE_SECRET_KEY", "")
    if not base_url or not service_key:
        print("Missing Supabase credentials in .env.local", file=sys.stderr)
        return 1

    rows = read_lotto_rows(XLSX_FILE)
    if not rows:
        print("No rows parsed from lotto.xlsx", file=sys.stderr)
        return 1

    upsert_rows(base_url, service_key, rows)
    print(f"Imported {len(rows)} draws from {XLSX_FILE.name}")
    print(f"First draw: {rows[-1]['draw_no']}, latest draw: {rows[0]['draw_no']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
