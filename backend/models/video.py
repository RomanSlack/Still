from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class VideoStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class VideoCreate(BaseModel):
    filename: str
    storage_path: str
    duration: Optional[float] = None


class VideoUpdate(BaseModel):
    title: Optional[str] = None
    tags: Optional[list[str]] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    status: Optional[VideoStatus] = None


class Video(BaseModel):
    id: str
    filename: str
    storage_path: str
    storage_url: Optional[str] = None
    title: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    transcript: Optional[str] = None
    summary: Optional[str] = None
    duration: Optional[float] = None
    status: VideoStatus = VideoStatus.PENDING
    created_at: datetime
    processed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class VideoSummaryItem(BaseModel):
    """Lightweight video model for list views (no transcript)."""
    id: str
    filename: str
    storage_path: str
    storage_url: Optional[str] = None
    title: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    summary: Optional[str] = None
    duration: Optional[float] = None
    status: VideoStatus = VideoStatus.PENDING
    created_at: datetime


class VideoList(BaseModel):
    videos: list[VideoSummaryItem]
    total: int


class ProcessingResult(BaseModel):
    video_id: str
    title: str
    tags: list[str]
    transcript: str
    summary: str
    status: VideoStatus
