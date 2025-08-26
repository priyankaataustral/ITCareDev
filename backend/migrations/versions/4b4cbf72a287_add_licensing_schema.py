"""add licensing schema

Revision ID: 4b4cbf72a287
Revises: 71daab99699a
Create Date: 2025-08-25
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "4b4cbf72a287"
down_revision = "71daab99699a"
branch_labels = None
depends_on = None


def upgrade():
    # --- resolution_attempts ---
    with op.batch_alter_table("resolution_attempts", schema=None) as batch_op:
        # autogen said these indexes were removed
        try:
            batch_op.drop_index("ix_ra_outcome")
        except Exception:
            pass
        try:
            batch_op.drop_index("ix_ra_ticket_attempt")
        except Exception:
            pass

        # autogen: added FK (agent_id) -> agents.id ; give it a NAME
        batch_op.create_foreign_key(
            "fk_resolution_attempts_agent_id",  # << named FK
            "agents",
            ["agent_id"],
            ["id"],
        )

    # --- email_queue ---
    with op.batch_alter_table("email_queue", schema=None) as batch_op:
        # autogen said removed index ix_eq_status
        try:
            batch_op.drop_index("ix_eq_status")
        except Exception:
            pass

    # --- messages ---
    with op.batch_alter_table("messages", schema=None) as batch_op:
        # autogen said removed index ix_messages_ticket_time
        try:
            batch_op.drop_index("ix_messages_ticket_time")
        except Exception:
            pass

    # --- tickets ---
    with op.batch_alter_table("tickets", schema=None) as batch_op:
        # autogen: TEXT() -> String() on requester_name
        batch_op.alter_column(
            "requester_name",
            existing_type=sa.TEXT(),
            type_=sa.String(),
            existing_nullable=True,
        )

        # autogen said removed these indexes (guard with try in case not present)
        try:
            batch_op.drop_index("ix_tickets_dept")
        except Exception:
            pass
        try:
            batch_op.drop_index("ix_tickets_priority")
        except Exception:
            pass

        # autogen: added FKs -> agents.id ; give them NAMES
        batch_op.create_foreign_key(
            "fk_tickets_assigned_to",  # << named FK
            "agents",
            ["assigned_to"],
            ["id"],
        )
        batch_op.create_foreign_key(
            "fk_tickets_resolved_by",  # << named FK
            "agents",
            ["resolved_by"],
            ["id"],
        )


def downgrade():
    # --- tickets ---
    with op.batch_alter_table("tickets", schema=None) as batch_op:
        # drop named FKs
        try:
            batch_op.drop_constraint("fk_tickets_assigned_to", type_="foreignkey")
        except Exception:
            pass
        try:
            batch_op.drop_constraint("fk_tickets_resolved_by", type_="foreignkey")
        except Exception:
            pass

        # recreate indexes that were dropped during upgrade
        batch_op.create_index("ix_tickets_priority", ["priority"], unique=False)
        batch_op.create_index("ix_tickets_dept", ["department_id"], unique=False)

        # revert type on requester_name
        batch_op.alter_column(
            "requester_name",
            existing_type=sa.String(),
            type_=sa.TEXT(),
            existing_nullable=True,
        )

    # --- messages ---
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.create_index(
            "ix_messages_ticket_time", ["ticket_id", "timestamp"], unique=False
        )

    # --- email_queue ---
    with op.batch_alter_table("email_queue", schema=None) as batch_op:
        batch_op.create_index("ix_eq_status", ["status", "created_at"], unique=False)

    # --- resolution_attempts ---
    with op.batch_alter_table("resolution_attempts", schema=None) as batch_op:
        try:
            batch_op.drop_constraint(
                "fk_resolution_attempts_agent_id", type_="foreignkey"
            )
        except Exception:
            pass
        # recreate indexes dropped during upgrade
        batch_op.create_index(
            "ix_ra_ticket_attempt", ["ticket_id", "attempt_no"], unique=False
        )
        batch_op.create_index("ix_ra_outcome", ["outcome"], unique=False)
