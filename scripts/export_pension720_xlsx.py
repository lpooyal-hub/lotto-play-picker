from __future__ import annotations

import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path("/home/ubuntu/lotto-play-picker")
SOURCE = ROOT / "연금720+ 회차별 당첨번호_20260624114326.xlsx"
OUTPUT = ROOT / "data" / "pension720Draws.json"
NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall("a:si", NS):
        values.append("".join(node.text or "" for node in item.findall(".//a:t", NS)))
    return values


def resolve_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet = workbook.find("a:sheets/a:sheet", NS)
    if sheet is None:
        raise RuntimeError("Workbook does not contain any sheets.")

    rel_id = sheet.attrib[REL_NS]
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for rel in rels:
        if rel.attrib.get("Id") == rel_id:
            return f"xl/{rel.attrib['Target']}"

    raise RuntimeError("Could not resolve first worksheet path.")


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    value = cell.find("a:v", NS)
    if value is None:
        return ""

    text = value.text or ""
    if cell.attrib.get("t") == "s":
        return shared_strings[int(text)]
    return text


def export_rows() -> list[dict]:
    with zipfile.ZipFile(SOURCE) as archive:
        shared_strings = load_shared_strings(archive)
        sheet_path = resolve_sheet_path(archive)
        root = ET.fromstring(archive.read(sheet_path))

    rows = []
    for row in root.findall(".//a:sheetData/a:row", NS):
        values = {cell.attrib.get("r", "")[:1]: cell_value(cell, shared_strings) for cell in row.findall("a:c", NS)}
        if values.get("A") == "No":
            continue
        if not values.get("B") or not values.get("C") or not values.get("D"):
            continue

        winning_number = values["D"].strip().zfill(6)
        rows.append(
            {
                "drawNo": int(float(values["B"])),
                "group": values["C"].strip(),
                "winningNumber": winning_number,
                "digits": [int(char) for char in winning_number],
            }
        )

    rows.sort(key=lambda item: item["drawNo"])
    return rows


def main() -> None:
    rows = export_rows()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(rows)} pension 720 draws to {OUTPUT}")


if __name__ == "__main__":
    main()
