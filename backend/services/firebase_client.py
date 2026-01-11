import os
import asyncio
from datetime import datetime, timezone
from typing import Optional
import firebase_admin
from firebase_admin import credentials, firestore, storage
from google.cloud.firestore_v1 import FieldFilter

from models.video import Video, VideoCreate, VideoUpdate, VideoStatus

# Initialize Firebase Admin SDK
_app = None


def get_firebase_app():
    global _app
    if _app is None:
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            _app = firebase_admin.initialize_app(cred)
        else:
            # Use default credentials (for Cloud Run)
            _app = firebase_admin.initialize_app()
    return _app


def get_firestore_client():
    get_firebase_app()
    database_id = os.getenv("FIRESTORE_DATABASE_ID", "(default)")
    return firestore.client(database_id=database_id)


def get_storage_bucket():
    get_firebase_app()
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET")
    if bucket_name:
        return storage.bucket(bucket_name)
    return storage.bucket()


class VideoRepository:
    COLLECTION = "videos"

    def __init__(self):
        self.db = get_firestore_client()
        self.collection = self.db.collection(self.COLLECTION)

    def _doc_to_video(self, doc) -> Video:
        data = doc.to_dict()
        return Video(
            id=doc.id,
            filename=data.get("filename", ""),
            storage_path=data.get("storage_path", ""),
            storage_url=data.get("storage_url"),
            title=data.get("title"),
            tags=data.get("tags", []),
            transcript=data.get("transcript"),
            summary=data.get("summary"),
            duration=data.get("duration"),
            status=VideoStatus(data.get("status", "pending")),
            created_at=data.get("created_at", datetime.now(timezone.utc)),
            processed_at=data.get("processed_at"),
        )

    async def create(self, video: VideoCreate) -> Video:
        now = datetime.now(timezone.utc)
        doc_ref = self.collection.document()

        data = {
            "filename": video.filename,
            "storage_path": video.storage_path,
            "duration": video.duration,
            "status": VideoStatus.PENDING.value,
            "tags": [],
            "created_at": now,
            "processed_at": None,
        }

        # Run blocking Firestore operation in thread pool
        await asyncio.to_thread(doc_ref.set, data)

        return Video(
            id=doc_ref.id,
            filename=video.filename,
            storage_path=video.storage_path,
            duration=video.duration,
            status=VideoStatus.PENDING,
            tags=[],
            created_at=now,
        )

    async def get(self, video_id: str) -> Optional[Video]:
        # Run blocking Firestore operation in thread pool
        doc = await asyncio.to_thread(self.collection.document(video_id).get)
        if not doc.exists:
            return None
        return self._doc_to_video(doc)

    async def list_all(
        self,
        status_filter: Optional[VideoStatus] = None,
        tag_filter: Optional[str] = None,
        limit: int = 50,
    ) -> list[Video]:
        query = self.collection.order_by("created_at", direction=firestore.Query.DESCENDING)

        if status_filter:
            query = query.where(filter=FieldFilter("status", "==", status_filter.value))

        if tag_filter:
            query = query.where(filter=FieldFilter("tags", "array_contains", tag_filter))

        query = query.limit(limit)

        # Run blocking Firestore operation in thread pool
        docs = await asyncio.to_thread(lambda: list(query.stream()))

        return [self._doc_to_video(doc) for doc in docs]

    async def update(self, video_id: str, update: VideoUpdate) -> Optional[Video]:
        doc_ref = self.collection.document(video_id)

        # Run blocking Firestore operation in thread pool
        doc = await asyncio.to_thread(doc_ref.get)

        if not doc.exists:
            return None

        update_data = {}
        if update.title is not None:
            update_data["title"] = update.title
        if update.tags is not None:
            update_data["tags"] = update.tags
        if update.transcript is not None:
            update_data["transcript"] = update.transcript
        if update.summary is not None:
            update_data["summary"] = update.summary
        if update.status is not None:
            update_data["status"] = update.status.value
            if update.status == VideoStatus.READY:
                update_data["processed_at"] = datetime.now(timezone.utc)

        if update_data:
            # Run blocking Firestore operation in thread pool
            await asyncio.to_thread(doc_ref.update, update_data)

        return await self.get(video_id)

    async def delete(self, video_id: str) -> bool:
        doc_ref = self.collection.document(video_id)

        # Run blocking Firestore operation in thread pool
        doc = await asyncio.to_thread(doc_ref.get)

        if not doc.exists:
            return False

        # Delete from storage
        data = doc.to_dict()
        storage_path = data.get("storage_path")
        if storage_path:
            try:
                bucket = get_storage_bucket()
                blob = bucket.blob(storage_path)
                # Run blocking storage operation in thread pool
                await asyncio.to_thread(blob.delete)
            except Exception:
                pass  # Continue even if storage deletion fails

        # Run blocking Firestore operation in thread pool
        await asyncio.to_thread(doc_ref.delete)
        return True

    async def get_all_tags(self) -> list[str]:
        """Get all unique tags across all videos."""
        # Run blocking Firestore operation in thread pool
        docs = await asyncio.to_thread(lambda: list(self.collection.stream()))
        tags = set()
        for doc in docs:
            data = doc.to_dict()
            for tag in data.get("tags", []):
                tags.add(tag)
        return sorted(list(tags))


def get_signed_url(storage_path: str, expiration_minutes: int = 60) -> str:
    """Generate a signed URL for a video in Firebase Storage."""
    from datetime import timedelta

    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)

    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=expiration_minutes),
        method="GET",
    )
    return url


def download_video_to_temp(storage_path: str) -> str:
    """Download a video from Firebase Storage to a temp file."""
    import tempfile

    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)

    # Get file extension from storage path
    ext = os.path.splitext(storage_path)[1] or ".mp4"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        blob.download_to_filename(tmp.name)
        return tmp.name


def upload_video_to_storage(local_path: str, storage_path: str) -> None:
    """Upload a video file to Firebase Storage."""
    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)
    blob.upload_from_filename(local_path, content_type="video/mp4")


def generate_upload_signed_url(storage_path: str, content_type: str = "video/mp4", expiration_minutes: int = 30) -> str:
    """Generate a signed URL for uploading a video to Firebase Storage."""
    from datetime import timedelta

    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)

    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=expiration_minutes),
        method="PUT",
        content_type=content_type,
    )
    return url
