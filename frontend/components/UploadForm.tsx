"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { uploadVideo, cancelUpload, UploadProgress, UploadTask } from "@/lib/firebase";
import { createVideo, processVideo } from "@/lib/api";

interface UploadFormProps {
  onUploadComplete?: () => void;
}

type UploadState = "idle" | "uploading" | "creating" | "processing" | "complete" | "error";

export default function UploadForm({ onUploadComplete }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const uploadTaskRef = useRef<UploadTask | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((selectedFile: File) => {
    // Validate file type
    if (!selectedFile.type.startsWith("video/")) {
      setError("Please select a video file");
      return;
    }

    // Validate file size (2GB max)
    if (selectedFile.size > 2 * 1024 * 1024 * 1024) {
      setError("File too large. Maximum size is 2GB");
      return;
    }

    setFile(selectedFile);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (!file) return;

    setError(null);
    setState("uploading");

    try {
      // Upload to Firebase Storage
      const { task, promise } = uploadVideo(file, setProgress);
      uploadTaskRef.current = task;

      const result = await promise;

      // Create video record in backend
      setState("creating");
      const video = await createVideo({
        filename: result.filename,
        storage_path: result.storagePath,
      });

      // Start AI processing
      setState("processing");
      await processVideo(video.id);

      setState("complete");

      // Reset after a moment
      setTimeout(() => {
        setFile(null);
        setState("idle");
        setProgress(null);
        onUploadComplete?.();
      }, 2000);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleCancel = () => {
    if (uploadTaskRef.current) {
      cancelUpload(uploadTaskRef.current);
    }
    setFile(null);
    setState("idle");
    setProgress(null);
    setError(null);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Drop zone */}
      {state === "idle" && !file && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-[var(--accent)] bg-[var(--card)]"
              : "border-[var(--border)] hover:border-[var(--muted)]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile) handleFile(selectedFile);
            }}
          />

          <Upload className="w-8 h-8 mx-auto mb-3 text-[var(--muted)]" />
          <p className="text-sm font-medium">Drop video here or click to upload</p>
          <p className="text-xs text-[var(--muted)] mt-1">MP4, MOV, or WebM up to 2GB</p>
        </div>
      )}

      {/* File selected */}
      {state === "idle" && file && (
        <div className="border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-[var(--muted)]">{formatBytes(file.size)}</p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleUpload}
            className="w-full mt-4 py-2.5 px-4 rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] font-medium hover:opacity-90"
          >
            Upload & Process
          </button>
        </div>
      )}

      {/* Uploading */}
      {state === "uploading" && progress && (
        <div className="border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Uploading...</span>
            <button
              onClick={handleCancel}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
          </div>

          <div className="h-2 bg-[var(--card)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>

          <p className="text-xs text-[var(--muted)] mt-2">
            {formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}
          </p>
        </div>
      )}

      {/* Creating / Processing */}
      {(state === "creating" || state === "processing") && (
        <div className="border border-[var(--border)] rounded-xl p-4 text-center">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-[var(--muted)]" />
          <p className="text-sm font-medium">
            {state === "creating" ? "Saving video..." : "Starting AI processing..."}
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">Almost done...</p>
        </div>
      )}

      {/* Complete */}
      {state === "complete" && (
        <div className="border border-green-200 bg-green-50 rounded-xl p-6 text-center">
          <CheckCircle className="w-8 h-8 mx-auto mb-3 text-green-600" />
          <p className="text-base font-medium text-green-800">Upload complete!</p>
          <p className="text-sm text-green-700 mt-2">
            AI processing is running in the background.
          </p>
          <p className="text-xs text-green-600 mt-1">
            You can close this page - your video will be ready when you return.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
