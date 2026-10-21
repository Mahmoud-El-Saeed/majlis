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


def _message_table_names() -> set[str]:
    """Names of the module-level tables that hold refusal messages.

    A private module-level dict is the repo's one way of keeping messages
    out of a raise site (the approval transition table _DECISIONS). The
    public ones are file-type maps, not messages.
    """
    names: set[str] = set()
    for path in sorted((APP_ROOT / "services").rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in tree.body:
            if isinstance(node, ast.Assign):
                table = node.value
                targets = node.targets
            elif isinstance(node, ast.AnnAssign):
                table = node.value
                targets = [node.target]
            else:
                continue
            if not isinstance(table, ast.Dict):
                continue
            for target in targets:
                if isinstance(target, ast.Name) and target.id.startswith("_"):
                    names.add(target.id)
    return names


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
                targets = node.targets
            elif isinstance(node, ast.AnnAssign):
                table = node.value
                targets = [node.target]
            else:
                continue
            if not isinstance(table, ast.Dict):
                continue
            private = any(
                isinstance(t, ast.Name) and t.id.startswith("_") for t in targets
            )
            if not private:
                continue
            for value in table.values:
                for inner in ast.walk(value):
                    if isinstance(inner, ast.Constant) and isinstance(inner.value, str):
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


def collect_dynamic_detail_sites() -> list[str]:
    """Raise sites whose message is NOT a literal, so it cannot be catalogued.

    A detail built at runtime ("x" + var, f"{var} failed", a formatted
    string) would slip past the coverage check and reach the user with no
    Arabic. The only allowed indirection is a lookup in a message table.
    """
    tables = _message_table_names()
    sites: list[str] = []
    for path in sorted((APP_ROOT / "services").rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Raise) or not isinstance(node.exc, ast.Call):
                continue
            func = node.exc.func
            name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
            if name not in _domain_error_names():
                continue
            for arg in node.exc.args:
                if _string_parts(arg) is not None:
                    continue
                if isinstance(arg, ast.Name) and _reads_from_table(arg.id, tree, tables):
                    continue
                sites.append(f"{path}:{node.lineno} ({ast.unparse(arg)})")
    return sites


def _reads_from_table(name: str, tree: ast.Module, tables: set[str]) -> bool:
    """True when the variable is read straight out of a message table."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            continue
        value = node.value
        if isinstance(value, ast.Subscript):
            base = value.value
            while isinstance(base, ast.Subscript):
                base = base.value
            if isinstance(base, ast.Name) and base.id in tables:
                return True
    return False


def collect_validation_messages() -> set[str]:
    """The 422 messages the request schemas can produce.

    Pydantic's wording is fixed, so it is derived from the schemas here
    instead of being hard-coded: a new constraint shows up as a new message
    the catalog must cover.
    """
    messages: set[str] = set()
    for path in sorted((APP_ROOT / "schemas").rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
                if name != "Field":
                    continue
                for keyword in node.keywords:
                    value = keyword.value
                    if not isinstance(value, ast.Constant) or not isinstance(value.value, int):
                        continue
                    number = value.value
                    if keyword.arg == "min_length":
                        messages.add(f"String should have at least {_characters(number)}")
                    elif keyword.arg == "max_length":
                        messages.add(f"String should have at most {_characters(number)}")
                    elif keyword.arg == "ge":
                        messages.add(f"Input should be greater than or equal to {number}")
                    elif keyword.arg == "le":
                        messages.add(f"Input should be less than or equal to {number}")
                    elif keyword.arg == "gt":
                        messages.add(f"Input should be greater than {number}")
            if isinstance(node, ast.AnnAssign):
                _annotation_messages(node.annotation, messages)
            if isinstance(node, ast.arg):
                _annotation_messages(node.annotation, messages)
    if messages:
        # Every request model with a required field produces this one.
        messages.add("Field required")
    return messages


def _annotation_messages(annotation: ast.AST | None, messages: set[str]) -> None:
    if annotation is None:
        return
    for node in ast.walk(annotation):
        if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name):
            if node.value.id == "Literal":
                elements = (
                    node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
                )
                values = [
                    element.value
                    for element in elements
                    if isinstance(element, ast.Constant) and isinstance(element.value, str)
                ]
                if values:
                    messages.add(_literal_message(values))
        elif isinstance(node, ast.Name) and node.id == "EmailStr":
            messages.add(
                "value is not a valid email address: An email address must have an @-sign."
            )
        elif isinstance(node, ast.Name) and node.id == "UUID":
            # Pydantic appends the offending character, so only the prefix is
            # fixed; the catalog matches it with a pattern.
            messages.add("Input should be a valid UUID")


def _characters(count: int) -> str:
    """Pydantic pluralizes: one character, many characters."""
    return f"{count} character" if count == 1 else f"{count} characters"


def _literal_message(values: list[str]) -> str:
    """Pydantic's wording for a Literal with the given members."""
    quoted = [f"'{value}'" for value in values]
    if len(quoted) == 1:
        return f"Input should be {quoted[0]}"
    return f"Input should be {', '.join(quoted[:-1])} or {quoted[-1]}"


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


def test_every_validation_message_has_a_message() -> None:
    entries = load_catalog()
    uncovered = sorted(
        message
        for message in collect_validation_messages()
        if not any(_entry_matches(entry, message) for entry in entries)
    )
    assert not uncovered, (
        "these 422 validation messages have no Arabic message in "
        f"{CATALOG_PATH.relative_to(REPO_ROOT)}:\n  " + "\n  ".join(uncovered)
    )


def test_no_detail_is_built_at_runtime() -> None:
    """A detail assembled at runtime cannot be catalogued, so it is a bug."""
    sites = collect_dynamic_detail_sites()
    assert not sites, (
        "these errors build their message at runtime and would reach the user "
        "with no Arabic:\n  " + "\n  ".join(sites)
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
