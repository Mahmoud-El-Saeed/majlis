"""widen attempt answer selected_index check

Revision ID: b6419a8ca65a
Revises: acaec1950d18
Create Date: 2026-10-20 19:48:02.083355

Hand-written: autogenerate cannot diff CHECK constraint text, so the
generated revision was empty (same precedent as 53e2b949f501).

MCQ questions carry 2+ options (the frontend allows up to 10) and the
questions.correct_index check was widened in 53e2b949f501, but
attempt_answers still capped selected_index at 3. A student picking option
4 or 5 hit an IntegrityError (500) on save/submit. The bogus upper bound is
dropped: an out-of-range selection simply scores incorrect in the service.

Reversibility: the downgrade restores the <= 3 predicate. A selection above
3 cannot be represented under the old schema, so those rows are cleared to
NULL first — the downgrade always succeeds instead of failing on data the
upgrade deliberately allowed. Selections at or below 3 are untouched.
"""

from alembic import op

revision = "b6419a8ca65a"
down_revision = "acaec1950d18"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No backfill: every existing row already satisfies the wider predicate.
    op.drop_constraint("ck_attempt_answers_selected_index", "attempt_answers", type_="check")
    op.create_check_constraint(
        "ck_attempt_answers_selected_index",
        "attempt_answers",
        "selected_index IS NULL OR selected_index >= 0",
    )


def downgrade() -> None:
    # Restores the <= 3 predicate. Clear first: the old schema has no way to
    # express a higher index, so leaving the rows would make the constraint
    # unappliable (a downgrade that cannot run is not reversible).
    op.drop_constraint("ck_attempt_answers_selected_index", "attempt_answers", type_="check")
    op.execute("UPDATE attempt_answers SET selected_index = NULL WHERE selected_index > 3")
    op.create_check_constraint(
        "ck_attempt_answers_selected_index",
        "attempt_answers",
        "selected_index IS NULL OR (selected_index >= 0 AND selected_index <= 3)",
    )
