from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .services.url_parser import name_from_slug


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Lead review workflow
LEAD_STATUSES = ("new", "reviewed", "shortlisted", "rejected")
# Import run lifecycle
RUN_STATUSES = ("queued", "running", "completed", "partial", "failed", "interrupted")


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    # Service categories this campaign targets, e.g. ["influencer_marketing", "ad_agency"]
    service_categories: Mapped[list] = mapped_column(JSON, default=list)
    # Extra keywords: both used to build LinkedIn search links and to boost relevance
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    exclude_keywords: Mapped[list] = mapped_column(JSON, default=list)
    locations: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    search_tasks: Mapped[list["SearchTask"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )


class SearchTask(Base):
    """One LinkedIn search the user should run manually (a generated link + checklist state)."""

    __tablename__ = "search_tasks"
    __table_args__ = (Index("uq_search_task_query", "campaign_id", "query_text", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"))
    query_text: Mapped[str] = mapped_column(String(500))
    search_url: Mapped[str] = mapped_column(Text)
    service_category: Mapped[str | None] = mapped_column(String(50), default=None)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|done|skipped
    posts_added: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    campaign: Mapped[Campaign] = relationship(back_populates="search_tasks")


class ImportRun(Base):
    """One batch of posts submitted by the user = one 'collection run'."""

    __tablename__ = "import_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="SET NULL"), default=None
    )
    search_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("search_tasks.id", ondelete="SET NULL"), default=None
    )
    source: Mapped[str] = mapped_column(String(30), default="manual")  # manual|bulk|csv
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    total: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[int] = mapped_column(Integer, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    near_duplicates: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    errors: Mapped[list["ErrorLog"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="SET NULL"), default=None, index=True
    )
    import_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_runs.id", ondelete="SET NULL"), default=None
    )

    # --- source / identity ---
    source_url: Mapped[str] = mapped_column(Text)
    # LinkedIn activity/share/ugcPost id: the dedup key for "same post"
    post_id: Mapped[str | None] = mapped_column(String(40), unique=True, default=None)
    post_id_kind: Mapped[str | None] = mapped_column(String(20), default=None)

    # --- content ---
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)  # sha256 of normalized text
    simhash: Mapped[str] = mapped_column(String(16), index=True)  # 64-bit hex, near-dup detection

    # --- author / company (all optional: users paste what they can see) ---
    author_name: Mapped[str | None] = mapped_column(String(200), default=None)
    author_headline: Mapped[str | None] = mapped_column(String(300), default=None)
    author_profile_url: Mapped[str | None] = mapped_column(Text, default=None)
    # Taken from the post URL itself; used only as a display fallback when no name was provided
    author_slug: Mapped[str | None] = mapped_column(String(200), default=None)
    company: Mapped[str | None] = mapped_column(String(200), default=None)
    location: Mapped[str | None] = mapped_column(String(200), default=None)

    # --- dates ---
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # --- classification ---
    service_category: Mapped[str] = mapped_column(String(50), default="other", index=True)
    relevance_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    intent_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    intent_label: Mapped[str] = mapped_column(String(20), default="low", index=True)
    is_india: Mapped[bool] = mapped_column(Boolean, default=False)
    matched_signals: Mapped[list] = mapped_column(JSON, default=list)

    # --- review workflow ---
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    notes: Mapped[str | None] = mapped_column(Text, default=None)

    # --- near-duplicate tracking ---
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    duplicate_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"), default=None
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    @property
    def author_display(self) -> str | None:
        return self.author_name or name_from_slug(self.author_slug)


class ErrorLog(Base):
    __tablename__ = "error_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_runs.id", ondelete="CASCADE"), default=None, index=True
    )
    level: Mapped[str] = mapped_column(String(10), default="error")  # error|warning|info
    stage: Mapped[str] = mapped_column(String(30))  # parse|validate|classify|save|run
    message: Mapped[str] = mapped_column(Text)
    # Raw input item so a failed item can be retried without the user pasting it again
    payload: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), default=None)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    run: Mapped[ImportRun | None] = relationship(back_populates="errors")
