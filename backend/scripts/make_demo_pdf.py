"""Turn the demo markdown note into a small multi-page PDF.

The demo needs a real PDF so the Mistral OCR path is the one on screen rather than
the plain-text shortcut. Written against the PDF spec directly to avoid adding a
rendering dependency for a single fixture.

    .venv\\Scripts\\python.exe scripts\\make_demo_pdf.py
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEMO_DIR = BACKEND_DIR.parent / "demo"
SOURCE = DEMO_DIR / "retrieval-grounding-study.md"
TARGET = DEMO_DIR / "retrieval-grounding-study.pdf"

PAGE_WIDTH, PAGE_HEIGHT = 612, 792
MARGIN = 64
LEADING = 15.5
BODY_SIZE = 10.5
HEADING_SIZE = 13.5
TITLE_SIZE = 17
WRAP_AT = 88
LINES_PER_PAGE = int((PAGE_HEIGHT - MARGIN * 2) / LEADING)


def escape(text: str) -> str:
    ascii_text = text.encode("ascii", errors="replace").decode("ascii")
    return ascii_text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def layout(markdown: str) -> list[list[tuple[str, float, bool]]]:
    """Break the note into pages of (text, font size, is_bold) lines."""
    lines: list[tuple[str, float, bool]] = []

    for raw in markdown.splitlines():
        stripped = raw.strip()
        if not stripped:
            lines.append(("", BODY_SIZE, False))
            continue

        if stripped.startswith("# "):
            lines.append((stripped[2:], TITLE_SIZE, True))
            lines.append(("", BODY_SIZE, False))
        elif stripped.startswith("## "):
            lines.append(("", BODY_SIZE, False))
            lines.append((stripped[3:], HEADING_SIZE, True))
        else:
            for wrapped in textwrap.wrap(stripped, WRAP_AT) or [""]:
                lines.append((wrapped, BODY_SIZE, False))

    pages: list[list[tuple[str, float, bool]]] = []
    for start in range(0, len(lines), LINES_PER_PAGE):
        pages.append(lines[start : start + LINES_PER_PAGE])
    return pages


def content_stream(page_lines: list[tuple[str, float, bool]]) -> bytes:
    parts = ["BT", f"1 0 0 1 {MARGIN} {PAGE_HEIGHT - MARGIN} Tm", f"{LEADING} TL"]
    for text, size, bold in page_lines:
        font = "/F2" if bold else "/F1"
        parts.append(f"{font} {size} Tf")
        parts.append(f"({escape(text)}) Tj" if text else "() Tj")
        parts.append("T*")
    parts.append("ET")
    return "\n".join(parts).encode("latin-1")


def build(pages: list[list[tuple[str, float, bool]]]) -> bytes:
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog_id = add(b"")  # 1, patched once the page tree id is known
    pages_id = add(b"")  # 2
    regular_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    bold_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    page_ids: list[int] = []
    for page_lines in pages:
        stream = content_stream(page_lines)
        content_id = add(
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )
        page_id = add(
            f"<< /Type /Page /Parent {pages_id} 0 R "
            f"/MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 {regular_id} 0 R /F2 {bold_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>".encode()
        )
        page_ids.append(page_id)

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id - 1] = (
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()
    )
    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode()

    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return bytes(out)


def main() -> int:
    if not SOURCE.exists():
        print(f"missing source: {SOURCE}")
        return 1

    pages = layout(SOURCE.read_text(encoding="utf-8"))
    TARGET.write_bytes(build(pages))

    try:
        from pypdf import PdfReader

        reader = PdfReader(str(TARGET))
        extracted = (reader.pages[0].extract_text() or "").strip()
        print(f"wrote {TARGET.name}: {len(pages)} pages, {TARGET.stat().st_size} bytes")
        print(f"first page starts: {extracted.splitlines()[0][:70] if extracted else '(no text)'}")
        if not extracted:
            print("warning: no extractable text, the PDF may be malformed")
            return 1
    except ImportError:
        print(f"wrote {TARGET.name}: {len(pages)} pages (not verified, pypdf missing)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
