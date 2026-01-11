"use client";

import VideoCard from "./VideoCard";
import type { Video } from "@/lib/api";

interface VideoGridProps {
  videos: Video[];
  loading?: boolean;
}

export default function VideoGrid({ videos, loading }: VideoGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[9/16] rounded-xl bg-[var(--card)]" />
            <div className="mt-3 px-1 space-y-2">
              <div className="h-4 bg-[var(--card)] rounded w-3/4" />
              <div className="h-3 bg-[var(--card)] rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--muted)]">No videos yet</p>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Upload your first video to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {videos.map((video, index) => (
        <VideoCard key={video.id} video={video} index={index} />
      ))}
    </div>
  );
}
