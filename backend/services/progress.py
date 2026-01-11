"""Simple in-memory progress tracking for video processing."""
from typing import Dict, Optional
from dataclasses import dataclass
from enum import Enum
import asyncio


class ProcessingStage(str, Enum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    TRANSCODING = "transcoding"
    TRANSCRIBING = "transcribing"
    GENERATING = "generating"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class ProcessingProgress:
    video_id: str
    stage: ProcessingStage
    message: str
    percent: int = 0


# In-memory store for progress (for single-instance deployment)
# For multi-instance, use Redis
_progress_store: Dict[str, ProcessingProgress] = {}
_subscribers: Dict[str, list] = {}  # video_id -> list of queues


def update_progress(video_id: str, stage: ProcessingStage, message: str, percent: int = 0):
    """Update progress for a video and notify subscribers."""
    progress = ProcessingProgress(
        video_id=video_id,
        stage=stage,
        message=message,
        percent=percent,
    )
    _progress_store[video_id] = progress

    # Notify all subscribers for this video
    if video_id in _subscribers:
        for queue in _subscribers[video_id]:
            try:
                queue.put_nowait(progress)
            except asyncio.QueueFull:
                pass  # Skip if queue is full


def get_progress(video_id: str) -> Optional[ProcessingProgress]:
    """Get current progress for a video."""
    return _progress_store.get(video_id)


def clear_progress(video_id: str):
    """Clear progress for a completed/failed video."""
    _progress_store.pop(video_id, None)


async def subscribe(video_id: str) -> asyncio.Queue:
    """Subscribe to progress updates for a video."""
    queue = asyncio.Queue(maxsize=10)

    if video_id not in _subscribers:
        _subscribers[video_id] = []
    _subscribers[video_id].append(queue)

    # Send current progress if available
    current = get_progress(video_id)
    if current:
        await queue.put(current)

    return queue


def unsubscribe(video_id: str, queue: asyncio.Queue):
    """Unsubscribe from progress updates."""
    if video_id in _subscribers:
        try:
            _subscribers[video_id].remove(queue)
            if not _subscribers[video_id]:
                del _subscribers[video_id]
        except ValueError:
            pass
