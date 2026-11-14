"""Remove OTP verification and add 6-digit PIN authentication

Revision ID: b2841cf6a120
Revises: d1558eeb2aad
Create Date: 2026-11-14 12:24:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2841cf6a120'
down_revision: Union[str, Sequence[str], None] = 'd1558eeb2aad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: drop otp_verifications and add pin columns to users."""
    # 1. Add pin and rate-limiting columns to users
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pin_hash', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('failed_login_attempts', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))

    # 2. Safely drop otp_verifications table if it exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'otp_verifications' in inspector.get_table_names():
        with op.batch_alter_table('otp_verifications', schema=None) as batch_op:
            try:
                batch_op.drop_index('ix_otp_verifications_phone_number')
            except Exception:
                pass
        op.drop_table('otp_verifications')


def downgrade() -> None:
    """Downgrade schema: recreate otp_verifications and drop pin columns."""
    op.create_table(
        'otp_verifications',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('phone_number', sa.String(length=20), nullable=False),
        sa.Column('otp_code_hash', sa.String(length=255), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('is_verified', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('otp_verifications', schema=None) as batch_op:
        batch_op.create_index('ix_otp_verifications_phone_number', ['phone_number'], unique=False)

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('locked_until')
        batch_op.drop_column('failed_login_attempts')
        batch_op.drop_column('pin_hash')

