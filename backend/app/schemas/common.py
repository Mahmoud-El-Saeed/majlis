from enum import Enum


def enum_str(value: Enum | str) -> str:
    """Unwrap StrEnum members to plain strings (shared by schema converters)."""
    return value.value if isinstance(value, Enum) else str(value)
