import os
import tempfile
import subprocess
from openai import OpenAI


def needs_transcode(video_path: str) -> bool:
    """Check if video needs transcoding (HEVC/H.265)."""
    cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0",
           "-show_entries", "stream=codec_name", "-of", "csv=p=0", video_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    # Strip whitespace and any trailing commas from ffprobe output
    codec = result.stdout.strip().lower().rstrip(',')
    return codec in ["hevc", "h265", "vp9"]


def transcode_to_h264(video_path: str) -> str:
    """Transcode video to H.264 for browser compatibility."""
    output_path = tempfile.mktemp(suffix=".mp4")

    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-c:v", "libx264",      # H.264 codec
        "-preset", "fast",       # Balance speed/quality
        "-crf", "23",            # Good quality
        "-c:a", "aac",           # AAC audio
        "-b:a", "128k",
        "-movflags", "+faststart",  # Web streaming optimization
        "-y",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Transcode failed: {result.stderr}")

    return output_path


def extract_audio(video_path: str) -> str:
    """Extract audio from video file using ffmpeg."""
    audio_path = tempfile.mktemp(suffix=".mp3")

    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vn",  # No video
        "-acodec", "libmp3lame",  # MP3 codec (Whisper prefers mp3)
        "-ar", "16000",  # 16kHz sample rate
        "-ac", "1",  # Mono
        "-b:a", "64k",  # Bitrate
        "-y",  # Overwrite
        audio_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"ffmpeg failed: {result.stderr}")

    return audio_path


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using OpenAI Whisper API."""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    # Check file size - Whisper API limit is 25MB
    file_size = os.path.getsize(audio_path)
    if file_size > 25 * 1024 * 1024:
        # For larger files, we'd need to chunk - but mp3 at 64kbps should be small
        print(f"Warning: Audio file is {file_size / 1024 / 1024:.1f}MB")

    with open(audio_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="text",
        )

    return transcript


def transcribe_video(video_path: str) -> str:
    """Full pipeline: extract audio from video and transcribe with Whisper."""
    audio_path = None
    try:
        audio_path = extract_audio(video_path)
        transcript = transcribe_audio(audio_path)
        return transcript
    finally:
        # Cleanup temp audio file
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
