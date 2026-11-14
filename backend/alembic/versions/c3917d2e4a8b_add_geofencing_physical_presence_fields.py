"""add geofencing physical presence fields

Revision ID: c3917d2e4a8b
Revises: b2841cf6a120
Create Date: 2026-11-14 16:34:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3917d2e4a8b'
down_revision: Union[str, None] = 'b2841cf6a120'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('attendance_records', schema=None) as batch_op:
        batch_op.add_column(sa.Column('verified_distance_meters', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('reported_accuracy_meters', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('client_ip', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('verification_method', sa.String(length=30), server_default='QR_GPS', nullable=False))

    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('office_latitude', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('office_longitude', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('geofence_radius_meters', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_column('geofence_radius_meters')
        batch_op.drop_column('office_longitude')
        batch_op.drop_column('office_latitude')

    with op.batch_alter_table('attendance_records', schema=None) as batch_op:
        batch_op.drop_column('verification_method')
        batch_op.drop_column('client_ip')
        batch_op.drop_column('reported_accuracy_meters')
        batch_op.drop_column('verified_distance_meters')

