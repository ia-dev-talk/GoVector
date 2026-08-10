from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)

    user_id = Column(Integer)
    username = Column(String)

    role = Column(String)

    action = Column(String)

    entity_type = Column(String)
    entity_id = Column(Integer)

    details = Column(Text)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )