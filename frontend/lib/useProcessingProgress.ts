import { useEffect, useState, useCallback } from "react";
import { getToken } from "./auth";

export interface ProcessingProgress {
  stage: string;
  message: string;
  percent: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useProcessingProgress(videoId: string | null, enabled: boolean = true) {
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!videoId || !enabled) {
      setProgress(null);
      setIsConnected(false);
      return;
    }

    const token = getToken();
    if (!token) return;

    let eventSource: EventSource | null = null;
    let retryCount = 0;
    const maxRetries = 3;

    const connect = () => {
      // EventSource doesn't support custom headers, so we pass token as query param
      // Note: For production, consider using fetch with ReadableStream instead
      const url = `${API_URL}/videos/${videoId}/progress`;

      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setIsConnected(true);
        retryCount = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "progress") {
            setProgress({
              stage: data.stage,
              message: data.message,
              percent: data.percent,
            });

            // Close connection when complete or failed
            if (data.stage === "complete" || data.stage === "failed") {
              eventSource?.close();
              setIsConnected(false);
            }
          } else if (data.type === "connected") {
            setIsConnected(true);
          }
        } catch (e) {
          console.error("Error parsing SSE data:", e);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        setIsConnected(false);

        // Retry connection
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(connect, 2000 * retryCount);
        }
      };
    };

    connect();

    return () => {
      eventSource?.close();
      setIsConnected(false);
    };
  }, [videoId, enabled]);

  return { progress, isConnected };
}

// Simple polling fallback for environments where SSE doesn't work
export function useProcessingPolling(
  videoId: string | null,
  enabled: boolean = true,
  onComplete?: () => void
) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId || !enabled) return;

    const poll = async () => {
      try {
        const token = getToken();
        const response = await fetch(`${API_URL}/videos/${videoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setStatus(data.status);
          if (data.status === "ready" || data.status === "failed") {
            onComplete?.();
          }
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    };

    const interval = setInterval(poll, 3000);
    poll(); // Initial poll

    return () => clearInterval(interval);
  }, [videoId, enabled, onComplete]);

  return status;
}
