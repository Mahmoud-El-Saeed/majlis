"""roles enum + teacher invites

Revision ID: 6dc678b02a06
Revises: 0001_users
Create Date: 2026-09-19 16:12:44.465887

Reviewed autogenerate candidate (standing workflow):
- teacher_invites table + indexes: kept as generated.
- users.role VARCHAR -> native PG ENUM: autogenerate omits both the
  explicit CREATE TYPE and the USING cast, and the raw ALTER fails on
  Postgres. Fixed with explicit type create + postgresql_using.
- server_default 'student' kept on the column in both directions
  (matches model + 0001 intent).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "6dc678b02a06"
down_revision = "0001_users"
branch_labels = None
depends_on = None

user_role = postgresql.ENUM("admin", "teacher", "student", name="user_role")


def upgrade() -> None:
    user_role.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "teacher_invites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_teacher_invites_email"), "teacher_invites", ["email"], unique=False)
    op.create_index(
        op.f("ix_teacher_invites_token_hash"), "teacher_invites", ["token_hash"], unique=True
    )
    op.alter_column(
        "users",
        "role",
        server_default=None,
        existing_type=sa.VARCHAR(length=20),
        existing_nullable=False,
    )
    op.alter_column(
        "users",
        "role",
        existing_type=sa.VARCHAR(length=20),
        type_=user_role,
        postgresql_using="role::user_role",
        server_default="student",
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "users", "role", server_default=None, existing_type=user_role, existing_nullable=False
    )
    op.alter_column(
        "users",
        "role",
        existing_type=user_role,
        type_=sa.VARCHAR(length=20),
        server_default="student",
        existing_nullable=False,
    )
    op.drop_index(op.f("ix_teacher_invites_token_hash"), table_name="teacher_invites")
    op.drop_index(op.f("ix_teacher_invites_email"), table_name="teacher_invites")
    op.drop_table("teacher_invites")
    user_role.drop(op.get_bind(), checkfirst=True)
