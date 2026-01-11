import os
import asyncio
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse

from models.video import Video, VideoCreate, VideoUpdate, VideoList, VideoStatus, ProcessingResult, VideoSummaryItem
from services.firebase_client import VideoRepository, get_signed_url, download_video_to_temp, upload_video_to_storage
from services.transcription import transcribe_video, needs_transcode, transcode_to_h264
from services.ai_tagger import generate_title_and_tags_safe
from services.progress import (
    update_progress, get_progress, clear_progress, subscribe, unsubscribe,
    ProcessingStage
)

router = APIRouter(prefix="/videos", tags=["videos"])


def get_repo() -> VideoRepository:
    return VideoRepository()


async def process_video_task(video_id: str):
    """Background task to process a video."""
    import sys
    import traceback

    def log(msg):
        print(msg, flush=True)

    def progress(stage: ProcessingStage, message: str, percent: int = 0):
        update_progress(video_id, stage, message, percent)
        log(f"[PROCESS] [{stage.value}] {message}")

    repo = get_repo()
    temp_files = []

    try:
        progress(ProcessingStage.QUEUED, "Starting processing...", 0)

        # Get video record
        video = await repo.get(video_id)
        if not video:
            log(f"[PROCESS] Video {video_id} not found")
            return

        # Update status to processing
        await repo.update(video_id, VideoUpdate(status=VideoStatus.PROCESSING))

        # Download video from storage (run in thread to not block event loop)
        progress(ProcessingStage.DOWNLOADING, "Downloading video...", 10)
        video_path = await asyncio.to_thread(download_video_to_temp, video.storage_path)
        temp_files.append(video_path)

        # Check if transcoding is needed (run in thread)
        if await asyncio.to_thread(needs_transcode, video_path):
            progress(ProcessingStage.TRANSCODING, "Converting video format...", 20)
            transcoded_path = await asyncio.to_thread(transcode_to_h264, video_path)
            temp_files.append(transcoded_path)

            progress(ProcessingStage.TRANSCODING, "Uploading converted video...", 40)
            await asyncio.to_thread(upload_video_to_storage, transcoded_path, video.storage_path)

            video_path = transcoded_path
        else:
            progress(ProcessingStage.TRANSCODING, "Video format OK, skipping conversion", 40)

        # Transcribe (run in thread - this is an API call)
        progress(ProcessingStage.TRANSCRIBING, "Transcribing audio...", 50)
        transcript = await asyncio.to_thread(transcribe_video, video_path)
        progress(ProcessingStage.TRANSCRIBING, "Transcription complete", 70)

        # Fetch existing tags to pass to AI
        all_existing_tags = await repo.get_all_tags()

        # Generate title and tags (run in thread - this is an API call)
        progress(ProcessingStage.GENERATING, "Generating title and tags...", 80)
        result = await asyncio.to_thread(generate_title_and_tags_safe, transcript, all_existing_tags)
        progress(ProcessingStage.GENERATING, "AI analysis complete", 90)

        # Update video record
        await repo.update(
            video_id,
            VideoUpdate(
                title=result.title,
                tags=result.tags,
                transcript=transcript,
                summary=result.summary,
                status=VideoStatus.READY,
            ),
        )
        progress(ProcessingStage.COMPLETE, "Processing complete!", 100)

        # Clear progress after a short delay
        await asyncio.sleep(2)
        clear_progress(video_id)

    except Exception as e:
        log(f"[PROCESS] ERROR processing video {video_id}: {e}")
        log(f"[PROCESS] Traceback: {traceback.format_exc()}")
        progress(ProcessingStage.FAILED, f"Processing failed: {str(e)[:100]}", 0)
        try:
            await repo.update(video_id, VideoUpdate(status=VideoStatus.FAILED))
        except Exception as e2:
            log(f"[PROCESS] Failed to update status to FAILED: {e2}")

    finally:
        # Cleanup temp files
        for f in temp_files:
            if os.path.exists(f):
                os.remove(f)


@router.get("", response_model=VideoList)
async def list_videos(
    status: Optional[VideoStatus] = None,
    tag: Optional[str] = None,
    limit: int = 50,
):
    """List all videos, optionally filtered by status or tag."""
    repo = get_repo()
    videos = await repo.list_all(status_filter=status, tag_filter=tag, limit=limit)
    print(f"[API] Listing videos: count={len(videos)}, statuses={[v.status.value for v in videos]}", flush=True)

    # Convert to lightweight summary items (no transcript)
    summary_items = []
    for video in videos:
        try:
            # Run blocking operation in thread
            storage_url = await asyncio.to_thread(get_signed_url, video.storage_path)
        except Exception:
            storage_url = None

        summary_items.append(VideoSummaryItem(
            id=video.id,
            filename=video.filename,
            storage_path=video.storage_path,
            storage_url=storage_url,
            title=video.title,
            tags=video.tags,
            summary=video.summary,
            duration=video.duration,
            status=video.status,
            created_at=video.created_at,
        ))

    return VideoList(videos=summary_items, total=len(summary_items))


@router.get("/tags")
async def list_tags():
    """Get all unique tags."""
    repo = get_repo()
    tags = await repo.get_all_tags()
    return {"tags": tags}


@router.get("/{video_id}", response_model=Video)
async def get_video(video_id: str):
    """Get a single video by ID."""
    repo = get_repo()
    video = await repo.get(video_id)

    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Add signed URL (run in thread to not block)
    try:
        video.storage_url = await asyncio.to_thread(
            get_signed_url, video.storage_path, 120
        )
    except Exception:
        pass

    return video


@router.post("", response_model=Video, status_code=status.HTTP_201_CREATED)
async def create_video(video: VideoCreate):
    """Create a new video record (after upload to Firebase Storage)."""
    repo = get_repo()
    return await repo.create(video)


@router.post("/{video_id}/process", response_model=dict)
async def process_video(video_id: str, background_tasks: BackgroundTasks):
    """Trigger AI processing for a video (transcription + tagging)."""
    repo = get_repo()
    video = await repo.get(video_id)

    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    if video.status == VideoStatus.PROCESSING:
        return {"message": "Video is already being processed", "status": video.status}

    # Start background processing
    background_tasks.add_task(process_video_task, video_id)

    return {"message": "Processing started", "video_id": video_id, "status": "processing"}


@router.delete("/{video_id}")
async def delete_video(video_id: str):
    """Delete a video and its storage file."""
    repo = get_repo()
    deleted = await repo.delete(video_id)

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    return {"message": "Video deleted", "video_id": video_id}


@router.get("/{video_id}/progress")
async def get_video_progress(video_id: str):
    """SSE endpoint for real-time processing progress updates."""

    async def event_generator():
        queue = await subscribe(video_id)
        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connected', 'video_id': video_id})}\n\n"

            # Check current progress
            current = get_progress(video_id)
            if current:
                yield f"data: {json.dumps({'type': 'progress', 'stage': current.stage.value, 'message': current.message, 'percent': current.percent})}\n\n"

            # Listen for updates
            while True:
                try:
                    progress = await asyncio.wait_for(queue.get(), timeout=30.0)
                    data = {
                        "type": "progress",
                        "stage": progress.stage.value,
                        "message": progress.message,
                        "percent": progress.percent,
                    }
                    yield f"data: {json.dumps(data)}\n\n"

                    # If complete or failed, end the stream
                    if progress.stage in [ProcessingStage.COMPLETE, ProcessingStage.FAILED]:
                        break

                except asyncio.TimeoutError:
                    # Send keepalive
                    yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"

        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe(video_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
