"use client";

import Link from "next/link";
import { Play, Clock, Loader2, Download, Cog, Mic, Sparkles, CheckCircle, XCircle } from "lucide-react";
import type { Video } from "@/lib/api";
import { useProcessingProgress } from "@/lib/useProcessingProgress";

interface VideoCardProps {
  video: Video;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const stageIcons: Record<string, React.ReactNode> = {
  queued: <Loader2 className="w-5 h-5 animate-spin" />,
  downloading: <Download className="w-5 h-5 animate-pulse" />,
  transcoding: <Cog className="w-5 h-5 animate-spin" />,
  transcribing: <Mic className="w-5 h-5 animate-pulse" />,
  generating: <Sparkles className="w-5 h-5 animate-pulse" />,
  complete: <CheckCircle className="w-5 h-5 text-green-400" />,
  failed: <XCircle className="w-5 h-5 text-red-400" />,
};

interface VideoCardWithIndexProps extends VideoCardProps {
  index?: number;
  onStatusChange?: () => void;
}

export default function VideoCard({ video, index = 0, onStatusChange }: VideoCardWithIndexProps) {
  const isProcessing = video.status === "processing" || video.status === "pending";
  const hasFailed = video.status === "failed";

  // Subscribe to real-time progress updates
  const { progress, isConnected } = useProcessingProgress(
    isProcessing ? video.id : null,
    isProcessing
  );

  // Debug logging
  console.log("[VideoCard]", video.id, { status: video.status, isProcessing, progress, isConnected });

  return (
    <Link
      href={`/video/${video.id}`}
      className="group block animate-fade-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-[var(--card)] border border-[var(--border)] group-hover:border-[var(--muted)] group-hover:shadow-lg transition-all duration-300 group-hover:-translate-y-1">
        {/* Video thumbnail / preview */}
        {video.storage_url && !isProcessing ? (
          <video
            src={video.storage_url}
            className="w-full h-full object-cover"
            muted
            playsInline
            preload="metadata"
            onMouseEnter={(e) => {
              const target = e.target as HTMLVideoElement;
              target.currentTime = 0;
              target.play().catch(() => {});
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLVideoElement;
              target.pause();
              target.currentTime = 0;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--card)] to-[var(--border)]">
            {!isProcessing && <Play className="w-8 h-8 text-[var(--muted)]" />}
          </div>
        )}

        {/* Processing overlay with real-time progress */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-4">
            <div className="text-white text-center">
              {/* Stage icon */}
              <div className="mb-3">
                {progress ? stageIcons[progress.stage] || stageIcons.queued : stageIcons.queued}
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-[120px] h-1.5 bg-white/20 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress?.percent || 0}%` }}
                />
              </div>

              {/* Stage message */}
              <p className="text-xs font-medium">
                {progress?.message || "Starting..."}
              </p>

              {/* Percentage */}
              {progress && progress.percent > 0 && (
                <p className="text-[10px] text-white/60 mt-1">
                  {progress.percent}%
                </p>
              )}

              {/* Connection status for debugging */}
              {!isConnected && !progress && (
                <p className="text-[10px] text-white/40 mt-2">
                  Connecting...
                </p>
              )}
            </div>
          </div>
        )}

        {hasFailed && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <span className="text-xs text-red-500 bg-white/90 px-2 py-1 rounded">
              Processing failed
            </span>
          </div>
        )}

        {/* Duration badge */}
        {video.duration && !isProcessing && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 text-white text-xs px-2 py-1 rounded">
            <Clock className="w-3 h-3" />
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Play icon on hover (only for ready videos) */}
        {!isProcessing && !hasFailed && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-[var(--foreground)] ml-0.5" fill="currentColor" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-3 px-1">
        <h3 className="font-medium text-sm truncate">
          {isProcessing ? "Processing..." : (video.title || video.filename)}
        </h3>
        <p className="text-xs text-[var(--muted)] mt-1">
          {formatDate(video.created_at)}
        </p>

        {/* Tags */}
        {video.tags.length > 0 && !isProcessing && (
          <div className="flex flex-wrap gap-1 mt-2">
            {video.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]"
              >
                {tag}
              </span>
            ))}
            {video.tags.length > 3 && (
              <span className="text-xs text-[var(--muted)]">
                +{video.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
