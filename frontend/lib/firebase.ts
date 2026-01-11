import { getUploadUrl } from "./api";

export interface UploadProgress {
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
}

export interface UploadResult {
  storagePath: string;
  filename: string;
}

// Custom upload task that mimics Firebase UploadTask interface
export interface UploadTask {
  cancel: () => boolean;
}

export function uploadVideo(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): { task: UploadTask; promise: Promise<UploadResult> } {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;

  const task: UploadTask = {
    cancel: () => {
      if (xhr) {
        cancelled = true;
        xhr.abort();
        return true;
      }
      return false;
    },
  };

  const promise = new Promise<UploadResult>(async (resolve, reject) => {
    try {
      // Get signed upload URL from backend
      const { upload_url, storage_path, content_type } = await getUploadUrl(file.name);

      if (cancelled) {
        reject(new Error("Upload cancelled"));
        return;
      }

      // Upload using XMLHttpRequest for progress tracking
      xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          onProgress?.({
            progress,
            bytesTransferred: event.loaded,
            totalBytes: event.total,
          });
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr!.status >= 200 && xhr!.status < 300) {
          resolve({
            storagePath: storage_path,
            filename: file.name,
          });
        } else {
          reject(new Error(`Upload failed with status ${xhr!.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload cancelled"));
      });

      xhr.open("PUT", upload_url);
      xhr.setRequestHeader("Content-Type", content_type);
      xhr.send(file);
    } catch (error) {
      reject(error);
    }
  });

  return { task, promise };
}

export function cancelUpload(task: UploadTask): boolean {
  return task.cancel();
}
