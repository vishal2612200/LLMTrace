"""conversation checkpoints

Revision ID: 20260525_0004
Revises: 20260525_0003
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa

revision = "20260525_0004"
down_revision = "20260525_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("redacted_content", sa.Text(), nullable=False, server_default=""))
    op.execute("UPDATE messages SET redacted_content = preview WHERE redacted_content = ''")
    op.alter_column("messages", "redacted_content", server_default=None)
    op.create_table(
        "conversation_checkpoints",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("conversation_id", sa.String(length=64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("context_messages", sa.JSON(), nullable=False),
        sa.Column("message_count", sa.Integer(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "sequence", name="uq_conversation_checkpoint_sequence"),
    )
    op.create_index("ix_conversation_checkpoints_conversation_id", "conversation_checkpoints", ["conversation_id"])
    op.create_index("ix_conversation_checkpoints_created_at", "conversation_checkpoints", ["created_at"])
    op.create_index("ix_conversation_checkpoints_reason", "conversation_checkpoints", ["reason"])


def downgrade() -> None:
    op.drop_index("ix_conversation_checkpoints_reason", table_name="conversation_checkpoints")
    op.drop_index("ix_conversation_checkpoints_created_at", table_name="conversation_checkpoints")
    op.drop_index("ix_conversation_checkpoints_conversation_id", table_name="conversation_checkpoints")
    op.drop_table("conversation_checkpoints")
    op.drop_column("messages", "redacted_content")
