"""Contract: every detail the backend can send the UI has a specific Arabic message.

The backend answers in English (AGENTS.md: backend messages English) and the
frontend localizes them. Nothing used to enforce that link, so a new error
string could ship with no Arabic copy at all — the user would then see the
generic fallback for a failure that retrying can never fix.

This test closes the gap. It reads the backend source, enumerates EVERY detail
a service (or the auth/session gates) can raise, and asserts that the frontend
catalog either maps it to Arabic or passes it through on purpose, with a
reason. A new untranslated error fails here.

The catalog lives with the frontend (it holds the Arabic) and is read as plain
JSON, so neither side has to parse the other's source.
"""

import ast
import json
import re
from itertools import product
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
CATALOG_PATH = REPO_ROOT / "frontend" / "src" / "i18n" / "details.json"
APP_ROOT = BACKEND_ROOT / "app"

#: Values substituted into an f-string message to render a concrete example.
#: The catalog must cover the message whatever the interpolated value is.
NUMERIC_SAMPLES = ("5", "100")
LABEL_SAMPLES = ("PDF", "PDF, PNG, JPEG, and WEBP")


def _domain_error_names() -> set[str]:
    """Every exception class defined under app/services (the domain errors)."""
    names: set[str] = set()
    for path in sorted((APP_ROOT / "services").rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ClassDef):
                names.add(node.name)
    return names


def _string_parts(node: ast.AST) -> list[str] | None:
    """The literal segments of an f-string, with None marking a placeholder.

    None when the node is not a string at all, or holds an expression this
    scanner cannot render.
    """
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if not isinstance(node, ast.JoinedStr):
        return None
    parts: list[str] = []
    for value in node.values:
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            parts.append(value.value)
        elif isinstance(value, ast.FormattedValue):
            parts.append("\x00")
        else:
            return None
    return parts


def _samples_for(parts: list[str], hole: int) -> tuple[str, ...]:
    """Plausible values for one placeholder, read off its neighbours.

    "max {n}MB" interpolates a number, "Only {types}" interpolates a label —
    rendering one with the other's samples would invent messages the backend
    never sends.
    """
    before = parts[hole - 1] if hole > 0 else ""
    after = parts[hole + 1] if hole + 1 < len(parts) else ""
    if before.endswith("max ") or after.startswith("MB"):
        return NUMERIC_SAMPLES
    return LABEL_SAMPLES


def _renderings(parts: list[str]) -> set[str]:
    """Concrete messages an f-string can produce, one per sample combination."""
    holes = [i for i, part in enumerate(parts) if part == "\x00"]
    if not holes:
        return {"".join(parts)}
    out: set[str] = set()
    for combo in product(*(_samples_for(parts, hole) for hole in holes)):
        filled = list(parts)
        for hole, value in zip(holes, combo, strict=True):
            filled[hole] = value
        out.add("".join(filled))
    return out


def _message_table_values() -> set[str]:
    """Message strings kept in a module-level table instead of a raise site.

    The approval transition table (_DECISIONS) carries its refusal messages
    as dictionary values; they reach the UI exactly like a raised detail.
    """
    found: set[str] = set()
    for path in sorted((APP_ROOT / "services").rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in tree.body:
            if isinstance(node, ast.Assign):
                table = node.value
            elif isinstance(node, ast.AnnAssign):
                table = node.value
            else:
                continue
            if not isinstance(table, ast.Dict):
                continue
            for value in table.values:
                for inner in ast.walk(value):
                    if not isinstance(inner, ast.Constant) or not isinstance(inner.value, str):
                        continue
                    # A message reads like a sentence; a mime type does not.
                    if " " in inner.value and inner.value.endswith("."):
                        found.add(inner.value)
    return found


def collect_details() -> set[str]:
    """Every detail string the backend can put in an HTTP error response."""
    domain_errors = _domain_error_names()
    details: set[str] = set()

    for path in sorted(APP_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
                if name in domain_errors:
                    for arg in node.args:
                        parts = _string_parts(arg)
                        if parts is not None:
                            details |= _renderings(parts)
                elif name == "HTTPException":
                    # Raised or stashed in a variable first (the session gate
                    # builds the error once and raises it in two places).
                    for keyword in node.keywords:
                        if keyword.arg != "detail":
                            continue
                        value = keyword.value
                        branches = [value]
                        if isinstance(value, ast.IfExp):
                            branches = [value.body, value.orelse]
                        for branch in branches:
                            parts = _string_parts(branch)
                            if parts is not None:
                                details |= _renderings(parts)
            # The rate limiter answers with a JSON body, not an HTTPException.
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values, strict=True):
                    if not isinstance(key, ast.Constant) or key.value != "detail":
                        continue
                    parts = _string_parts(value)
                    if parts is not None:
                        details |= _renderings(parts)

    details |= _message_table_values()
    return details


def load_catalog() -> list[dict]:
    catalog = json.loads(CATALOG_PATH.read_text())
    return catalog["entries"]


def _entry_matches(entry: dict, detail: str) -> bool:
    if "detail" in entry and entry["detail"] == detail:
        return True
    pattern = entry.get("pattern")
    return bool(pattern) and re.search(pattern, detail) is not None


def test_catalog_file_exists() -> None:
    assert CATALOG_PATH.exists(), (
        f"the frontend error catalog is missing: {CATALOG_PATH}. "
        "Every backend detail needs an Arabic message (or a deliberate pass-through)."
    )


def test_every_entry_is_mapped_or_an_explicit_pass_through() -> None:
    for entry in load_catalog():
        assert entry.get("id"), f"catalog entry without an id: {entry}"
        assert entry.get("detail") or entry.get("pattern"), (
            f"catalog entry {entry['id']} matches nothing"
        )
        arabic = entry.get("ar")
        if arabic is None:
            assert entry.get("note"), (
                f"catalog entry {entry['id']} passes the English through with no reason"
            )
        else:
            assert arabic.strip(), f"catalog entry {entry['id']} has empty Arabic"
            assert re.search(r"[؀-ۿ]", arabic), (
                f"catalog entry {entry['id']} is not Arabic: {arabic!r}"
            )


def test_every_service_raised_detail_has_a_message() -> None:
    entries = load_catalog()
    uncovered = sorted(
        detail
        for detail in collect_details()
        if not any(_entry_matches(entry, detail) for entry in entries)
    )
    assert not uncovered, (
        "these backend details have no Arabic message in "
        f"{CATALOG_PATH.relative_to(REPO_ROOT)}:\n  " + "\n  ".join(uncovered)
    )


def test_every_catalog_entry_matches_a_real_detail() -> None:
    """No dead entries: every catalog entry catches something the backend sends.

    Entries marked ``framework`` are exempt — they cover messages FastAPI or
    Pydantic produce outside our source, and the frontend test proves those
    resolve through their own sample.
    """
    details = collect_details()
    for entry in load_catalog():
        sample = entry.get("sample", entry.get("detail"))
        assert sample is not None, f"catalog entry {entry['id']} has no sample"
        if entry.get("framework"):
            continue
        assert any(_entry_matches(entry, detail) for detail in details), (
            f"catalog entry {entry['id']} matches no detail the backend can send: {sample!r}"
        )
