import { getToken, removeToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Video {
  id: string;
  filename: string;
  storage_path: string;
  storage_url?: string;
  title?: string;
  tags: string[];
  transcript?: string;
  summary?: string;
  duration?: number;
  status: "pending" | "processing" | "ready" | "failed";
  created_at: string;
  processed_at?: string;
}

export interface VideoList {
  videos: Video[];
  total: number;
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = getToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  return response;
}

export async function authenticate(password: string): Promise<{ token: string; expires_at: string }> {
  const response = await fetch(`${API_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Authentication failed" }));
    throw new Error(error.detail || "Authentication failed");
  }

  return response.json();
}

export async function getVideos(tag?: string): Promise<VideoList> {
  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);

  const response = await fetchWithAuth(`/videos?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch videos");
  }

  return response.json();
}

export async function getVideo(id: string): Promise<Video> {
  const response = await fetchWithAuth(`/videos/${id}`);

  if (!response.ok) {
    throw new Error("Failed to fetch video");
  }

  return response.json();
}

export async function createVideo(data: {
  filename: string;
  storage_path: string;
  duration?: number;
}): Promise<Video> {
  const response = await fetchWithAuth("/videos", {
    method: "POST",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to create video record");
  }

  return response.json();
}

export async function processVideo(id: string): Promise<{ message: string; video_id: string }> {
  const response = await fetchWithAuth(`/videos/${id}/process`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to start processing");
  }

  return response.json();
}

export async function deleteVideo(id: string): Promise<void> {
  const response = await fetchWithAuth(`/videos/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete video");
  }
}

export async function getTags(): Promise<string[]> {
  const response = await fetchWithAuth("/videos/tags");

  if (!response.ok) {
    throw new Error("Failed to fetch tags");
  }

  const data = await response.json();
  return data.tags;
}
