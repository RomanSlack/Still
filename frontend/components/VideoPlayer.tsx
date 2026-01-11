"use client";

import { useEffect, useRef, useState } from "react";

interface VideoPlayerProps {
  src: string;
  className?: string;
}

export default function VideoPlayer({ src, className = "" }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);

  // Ensure we're on the client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !videoRef.current) return;

    // Dynamically import Plyr only on client side
    const initPlyr = async () => {
      const PlyrModule = await import("plyr");
      const Plyr = PlyrModule.default;

      if (playerRef.current) {
        playerRef.current.destroy();
      }

      playerRef.current = new Plyr(videoRef.current!, {
        controls: [
          "play-large",
          "play",
          "progress",
          "current-time",
          "duration",
          "mute",
          "volume",
          "settings",
          "fullscreen",
        ],
        settings: ["speed"],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        keyboard: { focused: true, global: false },
        tooltips: { controls: true, seek: true },
        invertTime: false,
      });
    };

    initPlyr();

    return () => {
      playerRef.current?.destroy();
    };
  }, [isClient]);

  // Update source when src changes
  useEffect(() => {
    if (playerRef.current && src) {
      playerRef.current.source = {
        type: "video",
        sources: [{ src, type: "video/mp4" }],
      };
    }
  }, [src]);

  return (
    <div className={`plyr-container ${className}`}>
      <style jsx global>{`
        .plyr-container {
          --plyr-color-main: #171717;
          --plyr-video-background: #000;
          --plyr-range-fill-background: #171717;
          --plyr-badge-background: #171717;
          --plyr-badge-text-color: #fff;
          --plyr-captions-background: rgba(0, 0, 0, 0.8);
          --plyr-control-spacing: 8px;
          --plyr-control-radius: 6px;
          --plyr-tooltip-background: #171717;
          --plyr-tooltip-color: #fff;
          --plyr-font-size-small: 12px;
          --plyr-font-size-base: 14px;
          border-radius: 0.75rem;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .plyr-container .plyr {
          border-radius: 0.75rem;
        }

        .plyr-container video {
          aspect-ratio: 9/16;
          max-height: 75vh;
          object-fit: contain;
          background: #000;
        }

        /* Controls container */
        .plyr-container .plyr__controls {
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
          padding: 12px 16px;
          gap: 8px;
          flex-wrap: nowrap;
        }

        /* Control buttons */
        .plyr-container .plyr__control {
          padding: 8px;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .plyr-container .plyr__control:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .plyr-container .plyr__control svg {
          width: 18px;
          height: 18px;
        }

        /* Large play button */
        .plyr-container .plyr__control--overlaid {
          background: rgba(0, 0, 0, 0.7);
          border: 2px solid rgba(255, 255, 255, 0.9);
          padding: 20px;
          border-radius: 50%;
          transition: all 0.3s ease;
        }

        .plyr-container .plyr__control--overlaid:hover {
          background: rgba(0, 0, 0, 0.85);
          transform: scale(1.1);
        }

        .plyr-container .plyr__control--overlaid svg {
          width: 28px;
          height: 28px;
          fill: #fff;
        }

        /* Progress bar */
        .plyr-container .plyr__progress {
          margin: 0 4px;
        }

        .plyr-container .plyr__progress__container {
          height: 6px;
        }

        .plyr-container .plyr__progress input[type=range] {
          height: 6px;
        }

        /* Time display */
        .plyr-container .plyr__time {
          font-size: 12px;
          font-weight: 500;
          padding: 0 4px;
          min-width: auto;
        }

        /* Volume */
        .plyr-container .plyr__volume {
          max-width: 80px;
          min-width: 60px;
        }

        /* Settings menu */
        .plyr-container .plyr__menu__container {
          background: rgba(0, 0, 0, 0.9);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .plyr-container .plyr__menu__container .plyr__control {
          padding: 8px 12px;
          font-size: 13px;
        }

        /* Tooltip */
        .plyr-container .plyr__tooltip {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
        }

        /* Fullscreen */
        .plyr--fullscreen video {
          max-height: 100vh;
          aspect-ratio: auto;
        }

        .plyr--fullscreen .plyr__controls {
          padding: 16px 24px;
        }

        /* Hide some controls on small widths */
        @media (max-width: 400px) {
          .plyr-container .plyr__volume {
            display: none;
          }
        }
      `}</style>
      <video
        ref={videoRef}
        src={src}
        playsInline
        crossOrigin="anonymous"
      />
    </div>
  );
}
