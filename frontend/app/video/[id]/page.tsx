"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, Loader2, Calendar, Clock, RefreshCw } from "lucide-react";
import { isAuthenticated } from "@/lib/auth";
import { getVideo, deleteVideo, processVideo, Video } from "@/lib/api";
import VideoPlayer from "@/components/VideoPlayer";
import ConfirmModal from "@/components/ConfirmModal";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function VideoPage() {
  const router = useRouter();
  const params = useParams();
  const videoId = params.id as string;

  const [mounted, setMounted] = useState(false);
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    loadVideo();
  }, [mounted, videoId, router]);

  // Poll for processing updates
  useEffect(() => {
    if (!video) return;

    const isProcessing = video.status === "processing" || video.status === "pending";
    if (!isProcessing) return;

    const interval = setInterval(loadVideo, 5000);
    return () => clearInterval(interval);
  }, [video]);

  const loadVideo = async () => {
    try {
      const data = await getVideo(videoId);
      setVideo(data);
    } catch (err) {
      setError("Failed to load video");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteVideo(videoId);
      router.push("/");
    } catch (err) {
      setError("Failed to delete video");
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    setError(null);
    try {
      await processVideo(videoId);
      // Reload to get updated status
      await loadVideo();
    } catch (err) {
      setError("Failed to start reprocessing");
    } finally {
      setReprocessing(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-[var(--muted)]">{error || "Video not found"}</p>
        <Link href="/" className="text-sm underline hover:no-underline">
          Back to home
        </Link>
      </div>
    );
  }

  const isProcessing = video.status === "processing" || video.status === "pending";

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 -ml-2 text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-medium truncate">
              {video.title || video.filename}
            </h1>
          </div>

          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={deleting}
            className="p-2 text-[var(--muted)] hover:text-red-500 disabled:opacity-50 transition-colors"
            title="Delete video"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Video player */}
          <div className="flex justify-center">
            {video.storage_url ? (
              <VideoPlayer
                src={video.storage_url}
                className="w-full max-w-sm"
              />
            ) : (
              <div className="w-full max-w-sm aspect-[9/16] rounded-xl bg-[var(--card)] flex items-center justify-center">
                <p className="text-[var(--muted)]">Video unavailable</p>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            {/* Status */}
            {isProcessing && (
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>AI processing in progress...</span>
              </div>
            )}

            {video.status === "failed" && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-500">Processing failed.</span>
                <button
                  onClick={handleReprocess}
                  disabled={reprocessing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {reprocessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Retry
                </button>
              </div>
            )}

            {/* Title */}
            <div>
              <h2 className="text-2xl font-medium">
                {video.title || "Untitled"}
              </h2>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-4 text-sm text-[var(--muted)]">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(video.created_at)}</span>
              </div>
              {video.duration && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>{formatDuration(video.duration)}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {video.tags.length > 0 && (
              <div className="animate-fade-in">
                <h3 className="text-sm font-medium text-[var(--muted)] mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {video.tags.map((tag, index) => (
                    <span
                      key={tag}
                      className="text-sm px-3 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] hover:border-[var(--muted)] transition-colors"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {video.summary && (
              <div className="animate-fade-in">
                <h3 className="text-sm font-medium text-[var(--muted)] mb-2">Summary</h3>
                <div className="p-4 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
                  <p className="text-sm leading-relaxed text-[var(--foreground)]">
                    {video.summary}
                  </p>
                </div>
              </div>
            )}

            {/* Transcript */}
            {video.transcript && (
              <div className="animate-fade-in">
                <h3 className="text-sm font-medium text-[var(--muted)] mb-2">
                  Transcript
                </h3>
                <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] max-h-96 overflow-y-auto">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--muted-foreground)]">
                    {video.transcript}
                  </p>
                </div>
              </div>
            )}

            {/* Delete button (mobile) */}
            <div className="pt-4 border-t border-[var(--border)] lg:hidden">
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={deleting}
                className="w-full py-3 px-4 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Delete Entry
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Entry"
        message="Are you sure you want to delete this journal entry? This action cannot be undone and the video will be permanently removed."
        confirmText="Delete"
        cancelText="Keep Entry"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
