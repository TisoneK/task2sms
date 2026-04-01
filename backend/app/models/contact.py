from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, UniqueConstraint
from app.core.database import Base


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String(100), nullable=True)    # friendly name e.g. "My phone"
    type = Column(String(20), nullable=False)     # email | phone | telegram | whatsapp
    value = Column(String(300), nullable=False)   # actual address / number / chat_id
    use_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "value", name="ix_contacts_user_value"),
    )
