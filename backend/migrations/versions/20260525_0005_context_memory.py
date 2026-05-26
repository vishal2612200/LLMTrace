"""context memory

Revision ID: 20260525_0005
Revises: 20260525_0004
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa

revision = "20260525_0005"
down_revision = "20260525_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("rolling_summary", sa.Text(), nullable=False, server_default=""))
    op.add_column("conversations", sa.Column("structured_memory", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")))
    op.alter_column("conversations", "rolling_summary", server_default=None)
    op.alter_column("conversations", "structured_memory", server_default=None)


def downgrade() -> None:
    op.drop_column("conversations", "structured_memory")
    op.drop_column("conversations", "rolling_summary")
