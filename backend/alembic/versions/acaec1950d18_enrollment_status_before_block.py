"""enrollment status_before_block

Revision ID: acaec1950d18
Revises: 53e2b949f501
Create Date: 2026-10-15 16:31:40.790752

Reviewed autogenerate candidate (standing workflow):
- Single add_column kept as generated: nullable, no default, same native
  PG enum type (enrollment_status) as status.
- Hand-fix: postgresql.ENUM with create_type=False so upgrade never
  re-issues CREATE TYPE for the pre-existing enum.
- Downgrade drops only the column; the shared enum type stays because
  enrollments.status still uses it (reversible, verified on majlis_test).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "acaec1950d18"
down_revision = "53e2b949f501"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "enrollments",
        sa.Column(
            "status_before_block",
            postgresql.ENUM(
                "pending",
                "approved",
                "rejected",
                "blocked",
                name="enrollment_status",
                create_type=False,
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("enrollments", "status_before_block")
