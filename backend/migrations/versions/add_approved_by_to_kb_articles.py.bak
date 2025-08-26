"""
Revision script to add 'approved_by' column to kb_articles table.
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column('kb_articles', sa.Column('approved_by', sa.String(), nullable=True))

def downgrade():
    op.drop_column('kb_articles', 'approved_by')
