"""Add enhanced KB and solution models

Revision ID: 71daab99699a
<<<<<<< HEAD
Revises:
Create Date: 2025-08-14 11:53:21.032631
=======
Revises: 
Create Date: 2025-08-14 11:53:21.032631

>>>>>>> origin/main
"""
from alembic import op
import sqlalchemy as sa

<<<<<<< HEAD
=======

>>>>>>> origin/main
# revision identifiers, used by Alembic.
revision = '71daab99699a'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
<<<<<<< HEAD
    # agents: ensure role is String and add FK(department_id -> departments.id) with a name
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.alter_column(
            'role',
            existing_type=sa.TEXT(),
            type_=sa.String(),
            existing_nullable=True,
            existing_server_default=sa.text("'L1'")
        )
        # name required in batch mode
        batch_op.create_foreign_key(
            'fk_agents_department_id',        # << named FK
            'departments',
            ['department_id'],
            ['id']
        )

    # email_queue: drop composite index so it can be recreated later if needed
    with op.batch_alter_table('email_queue', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_eq_status'))

    # messages: normalize created_at type and add FK(sender_agent_id -> agents.id) with a name
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.alter_column(
            'created_at',
            existing_type=sa.TEXT(),
            type_=sa.String(),
            existing_nullable=True
        )
        batch_op.drop_index(batch_op.f('ix_messages_ticket_time'))
        batch_op.create_foreign_key(
            'fk_messages_sender_agent_id',    # << named FK
            'agents',
            ['sender_agent_id'],
            ['id']
        )

    # ticket_events: create named index (was already using batch_op.f)
    with op.batch_alter_table('ticket_events', schema=None) as batch_op:
        batch_op.create_index(
            'ix_ticket_events_ticket_created',
            ['ticket_id', 'created_at'],
            unique=False
        )

    # tickets: normalize text columns and add FK(department_id -> departments.id) with a name
    with op.batch_alter_table('tickets', schema=None) as batch_op:
        batch_op.alter_column('subject',          existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
        batch_op.alter_column('category',         existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
        batch_op.alter_column('priority',         existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
        batch_op.alter_column('impact_level',     existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
        batch_op.alter_column('urgency_level',    existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
        batch_op.alter_column('requester_email',  existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
        batch_op.alter_column('created_at',       existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
        batch_op.alter_column('updated_at',       existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
        batch_op.drop_index(batch_op.f('ix_tickets_dept'))
        batch_op.drop_index(batch_op.f('ix_tickets_priority'))
        batch_op.create_foreign_key(
            'fk_tickets_department_id',       # << named FK
            'departments',
            ['department_id'],
            ['id']
        )


def downgrade():
    # tickets: drop named FK, restore indexes, and revert column types
    with op.batch_alter_table('tickets', schema=None) as batch_op:
        batch_op.drop_constraint('fk_tickets_department_id', type_='foreignkey')
        batch_op.create_index(batch_op.f('ix_tickets_priority'), ['priority'], unique=False)
        batch_op.create_index(batch_op.f('ix_tickets_dept'), ['department_id'], unique=False)
        batch_op.alter_column('updated_at',       existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
        batch_op.alter_column('created_at',       existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
        batch_op.alter_column('requester_email',  existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
        batch_op.alter_column('urgency_level',    existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
        batch_op.alter_column('impact_level',     existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
        batch_op.alter_column('priority',         existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
        batch_op.alter_column('category',         existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
        batch_op.alter_column('subject',          existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)

    # ticket_events: drop named index
    with op.batch_alter_table('ticket_events', schema=None) as batch_op:
        batch_op.drop_index('ix_ticket_events_ticket_created')

    # messages: drop named FK, restore index, revert column type
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_constraint('fk_messages_sender_agent_id', type_='foreignkey')
        batch_op.create_index(batch_op.f('ix_messages_ticket_time'), ['ticket_id', 'timestamp'], unique=False)
        batch_op.alter_column('created_at', existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)

    # email_queue: recreate composite index
    with op.batch_alter_table('email_queue', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_eq_status'), ['status', 'created_at'], unique=False)

    # agents: drop named FK and revert column type/default
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_constraint('fk_agents_department_id', type_='foreignkey')
        batch_op.alter_column(
            'role',
            existing_type=sa.String(),
            type_=sa.TEXT(),
            existing_nullable=True,
            existing_server_default=sa.text("'L1'")
        )
=======
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.alter_column('role',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True,
               existing_server_default=sa.text("'L1'"))
        batch_op.create_foreign_key(None, 'departments', ['department_id'], ['id'])

    with op.batch_alter_table('email_queue', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_eq_status'))

    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.drop_index(batch_op.f('ix_messages_ticket_time'))
        batch_op.create_foreign_key(None, 'agents', ['sender_agent_id'], ['id'])

    with op.batch_alter_table('ticket_events', schema=None) as batch_op:
        batch_op.create_index('ix_ticket_events_ticket_created', ['ticket_id', 'created_at'], unique=False)

    with op.batch_alter_table('tickets', schema=None) as batch_op:
        batch_op.alter_column('subject',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.alter_column('category',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.alter_column('priority',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.alter_column('impact_level',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.alter_column('urgency_level',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.alter_column('requester_email',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.alter_column('created_at',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.alter_column('updated_at',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
        batch_op.drop_index(batch_op.f('ix_tickets_dept'))
        batch_op.drop_index(batch_op.f('ix_tickets_priority'))
        batch_op.create_foreign_key(None, 'departments', ['department_id'], ['id'])

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('tickets', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.create_index(batch_op.f('ix_tickets_priority'), ['priority'], unique=False)
        batch_op.create_index(batch_op.f('ix_tickets_dept'), ['department_id'], unique=False)
        batch_op.alter_column('updated_at',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)
        batch_op.alter_column('created_at',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)
        batch_op.alter_column('requester_email',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)
        batch_op.alter_column('urgency_level',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)
        batch_op.alter_column('impact_level',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)
        batch_op.alter_column('priority',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)
        batch_op.alter_column('category',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)
        batch_op.alter_column('subject',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)

    with op.batch_alter_table('ticket_events', schema=None) as batch_op:
        batch_op.drop_index('ix_ticket_events_ticket_created')

    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.create_index(batch_op.f('ix_messages_ticket_time'), ['ticket_id', 'timestamp'], unique=False)
        batch_op.alter_column('created_at',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)

    with op.batch_alter_table('email_queue', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_eq_status'), ['status', 'created_at'], unique=False)

    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.alter_column('role',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True,
               existing_server_default=sa.text("'L1'"))

    # ### end Alembic commands ###
>>>>>>> origin/main
