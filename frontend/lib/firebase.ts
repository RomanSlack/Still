import { initializeApp, getApps } from "firebase/app";
import { getStorage, ref, uploadBytesResumable, UploadTask } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const storage = getStorage(app);

export interface UploadProgress {
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
}

export interface UploadResult {
  storagePath: string;
  filename: string;
}

export function uploadVideo(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): { task: UploadTask; promise: Promise<UploadResult> } {
  // Generate unique filename
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = `videos/${timestamp}_${sanitizedName}`;

  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file);

  const promise = new Promise<UploadResult>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.({
          progress,
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
        });
      },
      (error) => {
        reject(error);
      },
      () => {
        resolve({
          storagePath,
          filename: file.name,
        });
      }
    );
  });

  return { task, promise };
}

export function cancelUpload(task: UploadTask): boolean {
  return task.cancel();
}

export { storage };
