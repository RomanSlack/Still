"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, LogOut, RefreshCw } from "lucide-react";
import { isAuthenticated, removeToken } from "@/lib/auth";
import { getVideos, getTags, Video } from "@/lib/api";
import VideoGrid from "@/components/VideoGrid";
import TagFilter from "@/components/TagFilter";

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initial data load
  useEffect(() => {
    if (!mounted) return;

    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    loadData();
  }, [mounted, router]);

  // Reload videos when tag filter changes (but not on initial mount)
  useEffect(() => {
    if (!mounted || !isAuthenticated()) return;
    // Skip if this is the initial load (loading is still true)
    if (loading) return;

    loadVideos();
  }, [selectedTag]);

  const loadData = async () => {
    setError(null);
    try {
      const [videosData, tagsData] = await Promise.all([
        getVideos(selectedTag),
        getTags(),
      ]);
      console.log("[Home] Loaded videos:", videosData.videos.length, videosData.videos.map(v => ({ id: v.id, status: v.status, title: v.title })));
      setVideos(videosData.videos);
      setTags(tagsData);
    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err instanceof Error ? err.message : "Failed to load videos");
    } finally {
      setLoading(false);
    }
  };

  const loadVideos = async () => {
    try {
      const data = await getVideos(selectedTag);
      console.log("[Home] Refreshed videos:", data.videos.length);
      setVideos(data.videos);
    } catch (err) {
      console.error("Failed to load videos:", err);
    }
  };

  const handleLogout = () => {
    removeToken();
    router.push("/login");
  };

  // Poll for processing updates
  useEffect(() => {
    const hasProcessing = videos.some(
      (v) => v.status === "processing" || v.status === "pending"
    );

    if (!hasProcessing) return;

    const interval = setInterval(() => {
      loadVideos();
    }, 5000);

    return () => clearInterval(interval);
  }, [videos, selectedTag]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--foreground)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-medium">Video Journal</h1>

          <div className="flex items-center gap-3">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </Link>

            <button
              onClick={handleLogout}
              className="p-2 text-[var(--muted)] hover:text-[var(--foreground)]"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tag filter */}
        {tags.length > 0 && (
          <div className="mb-6">
            <TagFilter
              tags={tags}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
            />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={loadData}
              className="flex items-center gap-2 text-red-700 hover:text-red-900 text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        )}

        {/* Video grid */}
        <VideoGrid videos={videos} loading={loading} />
      </main>
    </div>
  );
}
