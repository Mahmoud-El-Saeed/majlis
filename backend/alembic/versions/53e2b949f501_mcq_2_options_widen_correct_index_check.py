"""mcq 2+ options: widen correct_index check

Revision ID: 53e2b949f501
Revises: c94efffc95e7
Create Date: 2026-10-13 14:28:16.021635

"""
from alembic import op
import sqlalchemy as sa


revision = '53e2b949f501'
down_revision = 'c94efffc95e7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Hand-written: autogenerate does not diff CHECK text. Old rows all
    # satisfy the new predicate (0-3 ⊂ valid indexes), so no backfill.
    op.drop_constraint("ck_questions_correct_index", "questions", type_="check")
    op.create_check_constraint(
        "ck_questions_correct_index",
        "questions",
        "correct_index IS NULL OR (json_typeof(options) = 'array'"
        " AND correct_index >= 0 AND correct_index < json_array_length(options))",
    )


def downgrade() -> None:
    # Only clean on DBs without >3 indexes; pre-existing rows (0-3) satisfy it.
    op.drop_constraint("ck_questions_correct_index", "questions", type_="check")
    op.create_check_constraint(
        "ck_questions_correct_index",
        "questions",
        "correct_index IS NULL OR (correct_index >= 0 AND correct_index <= 3)",
    )
