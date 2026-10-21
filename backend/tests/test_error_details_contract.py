"""Contract: every detail the backend can send the UI has a specific Arabic message.

The backend answers in English (AGENTS.md: backend messages English) and the
frontend localizes them. Nothing used to enforce that link, so a new error
string could ship with no Arabic copy at all — the user would then see the
generic fallback for a failure that retrying can never fix.

This test closes the gap. It reads the backend source, enumerates EVERY detail
a service (or the auth/session gates) can raise and every 422 message the
request schemas can produce, and asserts that the frontend catalog either maps
it to Arabic or passes it through on purpose, with a reason. A new untranslated
error fails here.

The catalog lives with the frontend (it holds the Arabic) and is read as plain
JSON, so neither side has to parse the other's source.
"""

import ast
import json
import re
from dataclasses import dataclass
from itertools import product
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
CATALOG_PATH = REPO_ROOT / "frontend" / "src" / "i18n" / "details.json"
APP_ROOT = BACKEND_ROOT / "app"

#: A placeholder is rendered as a character no real detail can contain, so a
#: literal catalog entry can never "cover" a dynamic message by accident: only
#: a pattern can. Two markers make the pattern prove it accepts more than one
#: value instead of pinning the one sample someone happened to type.
SENTINELS = ("\x00A", "\x00B")


def _call_name(node: ast.Call) -> str:
    func = node.func
    return func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")


def _domain_error_names() -> set[str]:
    """Every exception class defined under app/services (the domain errors).

    Only exception classes count: a plain dataclass such as AnswerSelection or
    StudentProgress is not an error, and its constructor arguments are not
    user-visible details.
    """
    bases: dict[str, set[str]] = {}
    for path in sorted((APP_ROOT / "services").rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text())):
            if not isinstance(node, ast.ClassDef):
                continue
            parents: set[str] = set()
            for base in node.bases:
                if isinstance(base, ast.Name):
                    parents.add(base.id)
                elif isinstance(base, ast.Attribute):
                    parents.add(base.attr)
            bases[node.name] = parents

    errors: set[str] = set()
    while True:
        found = {
            name
            for name, parents in bases.items()
            if parents & (errors | {"Exception", "BaseException"})
        }
        if found <= errors:
            return errors
        errors |= found


@dataclass(frozen=True)
class MessageTemplate:
    """A message with its literal segments and one filler set per placeholder.

    ``fillings`` is None for a placeholder whose values cannot be read off the
    source; those are rendered with SENTINELS so only a pattern can cover them.
    """

    parts: tuple[str | None, ...]
    fillings: tuple[tuple[str, ...] | None, ...]

    @property
    def is_dynamic(self) -> bool:
        return bool(self.fillings)

    @property
    def has_opaque_placeholder(self) -> bool:
        return any(fill is None for fill in self.fillings)

    def renderings(self) -> set[str]:
        options = [fill if fill is not None else SENTINELS for fill in self.fillings]
        holes = [i for i, part in enumerate(self.parts) if part is None]
        out: set[str] = set()
        for combo in product(*options):
            filled = list(self.parts)
            for hole, value in zip(holes, combo, strict=True):
                filled[hole] = value
            out.add("".join(part for part in filled if part is not None))
        return out


def _template(node: ast.AST, tree: ast.Module | None = None) -> MessageTemplate | None:
    """The literal segments of a message, one None per placeholder.

    None when the node is not a string at all, or holds an expression this
    scanner cannot render.
    """
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return MessageTemplate((node.value,), ())
    if not isinstance(node, ast.JoinedStr):
        return None
    parts: list[str | None] = []
    fillings: list[tuple[str, ...] | None] = []
    for value in node.values:
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            parts.append(value.value)
        elif isinstance(value, ast.FormattedValue):
            parts.append(None)
            fillings.append(_literal_returns(value.value, tree))
        else:
            return None
    return MessageTemplate(tuple(parts), tuple(fillings))


def _literal_returns(expr: ast.AST, tree: ast.Module | None) -> tuple[str, ...] | None:
    """Every string a local helper can return, when they are all literals.

    Keeps `f"Only {_supported_label(...)} attachments..."` honest: adding a
    label to the helper adds a real message the catalog must cover, instead of
    the test inventing a plausible-looking placeholder value.
    """
    if tree is None or not isinstance(expr, ast.Call) or not isinstance(expr.func, ast.Name):
        return None
    name = expr.func.id
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != name:
            continue
        values: set[str] = set()
        for inner in ast.walk(node):
            if not isinstance(inner, ast.Return):
                continue
            returned = inner.value
            if not (isinstance(returned, ast.Constant) and isinstance(returned.value, str)):
                return None
            values.add(returned.value)
        return tuple(sorted(values)) if values else None
    return None


def _resolve(node: ast.AST, constants: dict[str, ast.AST]) -> ast.AST:
    """Follow a simple `detail = "..."` binding (the session gate does this)."""
    if isinstance(node, ast.Name):
        return constants.get(node.id, node)
    return node


def _string_constants(tree: ast.Module) -> dict[str, ast.AST]:
    """Names bound to a string, or to an inline if/else of strings."""
    found: dict[str, ast.AST] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets = [t for t in node.targets if isinstance(t, ast.Name)]
            value = node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [t for t in [node.target] if isinstance(t, ast.Name)]
            value = node.value
        else:
            continue
        if _template(value) is None and not isinstance(value, ast.IfExp):
            continue
        for target in targets:
            found.setdefault(target.id, value)
    return found


def _private_message_dicts() -> list[tuple[str, ast.Dict]]:
    """Module-level private dicts that hold refusal messages.

    A private table is the repo's one way of keeping messages out of a raise
    site (the approval transition table _DECISIONS). The public ones are
    file-type maps, not messages.
    """
    found: list[tuple[str, ast.Dict]] = []
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
                    found.append((target.id, table))
    return found


def _message_table_names() -> set[str]:
    return {name for name, _ in _private_message_dicts()}


def _message_table_values() -> set[str]:
    """Message strings kept in a module-level table instead of a raise site.

    The approval transition table (_DECISIONS) carries its refusal messages
    as dictionary values; they reach the UI exactly like a raised detail.
    """
    found: set[str] = set()
    for _, table in _private_message_dicts():
        for value in table.values:
            if value is None:
                continue
            for inner in ast.walk(value):
                if isinstance(inner, ast.Constant) and isinstance(inner.value, str):
                    found.add(inner.value)
    return found


def _detail_templates() -> list[tuple[str, int, MessageTemplate]]:
    """Every message template the backend can put in an HTTP error response.

    Reads the domain-error calls, HTTPException (keyword or positional detail,
    including a detail stashed in a local variable), and the rate limiter's
    JSON body.
    """
    domain_errors = _domain_error_names()
    templates: list[tuple[str, int, MessageTemplate]] = []
    for path in sorted(APP_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text())
        constants = _string_constants(tree)
        location = str(path.relative_to(REPO_ROOT))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name = _call_name(node)
                if name in domain_errors:
                    values = list(node.args)
                elif name == "HTTPException":
                    values = [
                        keyword.value
                        for keyword in node.keywords
                        if keyword.arg == "detail"
                    ]
                    # HTTPException(status_code, detail) is legal too.
                    if len(node.args) > 1:
                        values.append(node.args[1])
                else:
                    values = []
                for value in values:
                    templates.extend(
                        _templates_at(location, node.lineno, value, constants, tree)
                    )
            # The rate limiter answers with a JSON body, not an HTTPException.
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values, strict=True):
                    if isinstance(key, ast.Constant) and key.value == "detail":
                        templates.extend(
                            _templates_at(location, node.lineno, value, constants, tree)
                        )
    return templates


def _templates_at(
    location: str,
    line: int,
    value: ast.AST,
    constants: dict[str, ast.AST],
    tree: ast.Module,
) -> list[tuple[str, int, MessageTemplate]]:
    resolved = _resolve(value, constants)
    branches = (
        [resolved.body, resolved.orelse]
        if isinstance(resolved, ast.IfExp)
        else [resolved]
    )
    found: list[tuple[str, int, MessageTemplate]] = []
    for branch in branches:
        template = _template(_resolve(branch, constants), tree)
        if template is not None:
            found.append((location, line, template))
    return found


def collect_details() -> set[str]:
    """Every detail string the backend can put in an HTTP error response."""
    details = {
        rendering
        for _, _, template in _detail_templates()
        for rendering in template.renderings()
    }
    details |= _message_table_values()
    return details


def collect_dynamic_detail_sites() -> list[str]:
    """Raise sites whose message is NOT a literal, so it cannot be catalogued.

    A detail built at runtime ("x" + var, .format(), a variable that is not a
    message-table lookup) would slip past the coverage check and reach the
    user with no Arabic. An f-string is allowed: its template is checked
    against the catalog by test_every_dynamic_detail_is_covered_by_one_pattern.
    """
    tables = _message_table_names()
    domain_errors = _domain_error_names()
    sites: list[str] = []
    for path in sorted((APP_ROOT / "services").rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Raise) or not isinstance(node.exc, ast.Call):
                continue
            if _call_name(node.exc) not in domain_errors:
                continue
            for arg in node.exc.args:
                if _template(arg, tree) is not None:
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
    instead of being hard-coded: a new constraint or validator shows up as a
    new message the catalog must cover.

    Field constraints, Literals, EmailStr/UUID and our own ``raise ValueError``
    messages are derived. Pydantic's raw type-coercion family ("Input should be
    a valid integer") is not: the client builds typed JSON, so a user cannot
    reach it; the catalog carries one generic pattern for that family.
    """
    messages: set[str] = set()
    for path in sorted((APP_ROOT / "schemas").rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Raise) and isinstance(node.exc, ast.Call):
                if _call_name(node.exc) != "ValueError":
                    continue
                for arg in node.exc.args:
                    template = _template(arg, tree)
                    # Pydantic prefixes a field validator's message.
                    if template is None or template.is_dynamic:
                        continue
                    message = template.renderings().pop()
                    if message:
                        messages.add(f"Value error, {message}")
            if isinstance(node, ast.Call):
                if _call_name(node) != "Field":
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
    """A detail assembled at runtime cannot be catalogued, so it is a bug.

    An f-string is not "runtime assembly" here: its template is fixed and the
    coverage test above requires a pattern that accepts every placeholder
    value. Concatenation, .format() and untabled variables are rejected.
    """
    sites = collect_dynamic_detail_sites()
    assert not sites, (
        "these errors build their message at runtime and would reach the user "
        "with no Arabic:\n  " + "\n  ".join(sites)
    )


def test_every_dynamic_detail_is_covered_by_one_pattern() -> None:
    """A message with a placeholder must be matched by a pattern, not a literal.

    The placeholder is filled with sentinels no real message contains, so a
    literal entry cannot match; one entry must accept every filling.
    """
    entries = load_catalog()
    uncovered: list[str] = []
    for location, line, template in _detail_templates():
        # Resolved placeholders produce real messages, checked one by one by
        # the coverage test. Only opaque placeholders need one wildcard entry.
        if not template.has_opaque_placeholder:
            continue
        renderings = template.renderings()
        if not any(
            all(_entry_matches(entry, rendering) for rendering in renderings)
            for entry in entries
        ):
            uncovered.append(f"{location}:{line} ({' | '.join(sorted(renderings))})")
    assert not uncovered, (
        "these dynamic messages are not covered by a single catalog pattern:\n  "
        + "\n  ".join(sorted(set(uncovered)))
    )


def test_every_catalog_entry_matches_a_real_detail() -> None:
    """No dead entries: every catalog entry catches something the backend sends.

    Entries marked ``framework`` are exempt — they cover messages FastAPI or
    Pydantic produce outside our source, and the frontend test proves those
    resolve through their own sample.
    """
    details = collect_details() | collect_validation_messages()
    for entry in load_catalog():
        sample = entry.get("sample", entry.get("detail"))
        assert sample is not None, f"catalog entry {entry['id']} has no sample"
        if entry.get("framework"):
            continue
        assert any(_entry_matches(entry, detail) for detail in details), (
            f"catalog entry {entry['id']} matches no detail the backend can send: {sample!r}"
        )
