import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import Utilities from "./components/Utilities";
import {
  getCurrentWindow,
  primaryMonitor,
} from "@tauri-apps/api/window";

import {
  PhysicalPosition,
  LogicalSize,
} from "@tauri-apps/api/dpi";

import MediaPlayer from "./components/MediaPlayer";
import Pomodoro from "./components/Pomodoro";
import "./App.css";

type TimerMode = "focus" | "shortBreak" | "longBreak";

type MediaInfo = {
  title: string;
  artist: string;
  album: string;
  source: string;
  isPlaying: boolean;
  canNext: boolean;
  canPrevious: boolean;
};

const DURATIONS: Record<TimerMode, number> = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const POSITION_KEY = "islandx-window-position-v2";

function App() {
  const [expanded, setExpanded] = useState(false);
  const [showMoreActivities, setShowMoreActivities] = useState(false);

  // Pomodoro state
  const [mode, setMode] = useState<TimerMode>("focus");
  const [seconds, setSeconds] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);

  // Media state
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [mediaSessions, setMediaSessions] = useState<MediaInfo[]>([]);
  const [selectedMediaSource, setSelectedMediaSource] = useState("");

  const initialResize = useRef(true);

  // Fetch selected media session.
  async function fetchMedia(source = selectedMediaSource) {
    if (!source) {
      setMedia(null);
      return;
    }

    try {
      const result = await invoke<MediaInfo>("get_media_info", {
        source,
      });

      setMedia(result);
      setMediaError(false);
    } catch (error) {
      console.error("Media fetch failed:", error);
      setMediaError(true);
    }
  }

  // Discover available Windows media sessions.
  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      try {
        const result = await invoke<MediaInfo[]>("get_media_sessions");

        if (cancelled) return;

        setMediaSessions(result);

        setSelectedMediaSource((current) => {
          if (current && result.some((item) => item.source === current)) {
            return current;
          }

          return result[0]?.source ?? "";
        });
      } catch (error) {
        console.error("Session discovery failed:", error);
      }
    }

    loadSessions();

    const interval = window.setInterval(loadSessions, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Refresh selected media information.
  useEffect(() => {
    fetchMedia();

    const interval = window.setInterval(fetchMedia, 1500);

    return () => window.clearInterval(interval);
  }, [selectedMediaSource]);

  // Media playback commands.
  async function mediaAction(command: string) {
    if (!selectedMediaSource) return;

    try {
      await invoke(command, {
        source: selectedMediaSource,
      });

      await fetchMedia();
    } catch (error) {
      console.error(`Media action ${command} failed:`, error);
    }
  }

  // Dynamically resize native Tauri window.
  useEffect(() => {
    if (initialResize.current) {
      initialResize.current = false;
      return;
    }

    let cancelled = false;

    async function resizeWindow() {
      try {
        const win = getCurrentWindow();
        const position = await win.outerPosition();
        const currentSize = await win.outerSize();

        const centerX = position.x + currentSize.width / 2;

        const targetSize = expanded
          ? new LogicalSize(420, 620)
          : new LogicalSize(230, 43);

        await win.setSize(targetSize);

        if (cancelled) return;

        const newSize = await win.outerSize();

        await win.setPosition(
          new PhysicalPosition(
            Math.round(centerX - newSize.width / 2),
            position.y
          )
        );
      } catch (error) {
        console.error("Native window resize failed:", error);
      }
    }

    resizeWindow();

    return () => {
      cancelled = true;
    };
  }, [expanded]);

  // Restore saved window position.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    async function initializePosition() {
      const win = getCurrentWindow();

      try {
        const saved = localStorage.getItem(POSITION_KEY);

        if (saved) {
          try {
            const position = JSON.parse(saved);

            if (
              Number.isFinite(position.x) &&
              Number.isFinite(position.y)
            ) {
              await win.setPosition(
                new PhysicalPosition(position.x, position.y)
              );
            } else {
              throw new Error("Invalid saved position");
            }
          } catch {
            localStorage.removeItem(POSITION_KEY);
            await positionAtCenter();
          }
        } else {
          await positionAtCenter();
        }

        if (cancelled) return;

        unlisten = await win.onMoved(({ payload }) => {
          localStorage.setItem(
            POSITION_KEY,
            JSON.stringify({
              x: payload.x,
              y: payload.y,
            })
          );
        });
      } catch (error) {
        console.error("Position initialization failed:", error);
      }
    }

    async function positionAtCenter() {
      const win = getCurrentWindow();
      const monitor = await primaryMonitor();

      if (!monitor) return;

      const size = await win.outerSize();

      const x =
        monitor.position.x +
        Math.round((monitor.size.width - size.width) / 2);

      await win.setPosition(
        new PhysicalPosition(x, monitor.position.y)
      );
    }

    initializePosition();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Native window dragging.
  async function handleDrag(event: ReactMouseEvent<HTMLElement>) {
    if (event.button !== 0) return;

    if ((event.target as HTMLElement).closest("button, select")) return;

    try {
      await getCurrentWindow().startDragging();
    } catch (error) {
      console.error("Dragging failed:", error);
    }
  }

  // Accurate Pomodoro countdown.
  useEffect(() => {
    if (!running || endAt === null) return;

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil((endAt - Date.now()) / 1000)
      );

      setSeconds(remaining);

      if (remaining === 0) {
        setRunning(false);
        setEndAt(null);
        setCompleted(true);
      }
    };

    updateTimer();

    const interval = window.setInterval(updateTimer, 250);

    return () => window.clearInterval(interval);
  }, [running, endAt]);

  function startTimer() {
    const duration = seconds === 0 ? DURATIONS[mode] : seconds;

    setSeconds(duration);
    setCompleted(false);
    setEndAt(Date.now() + duration * 1000);
    setRunning(true);
  }

  function pauseTimer() {
    if (endAt !== null) {
      setSeconds(
        Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      );
    }

    setEndAt(null);
    setRunning(false);
  }

  function resetTimer() {
    setRunning(false);
    setEndAt(null);
    setSeconds(DURATIONS[mode]);
    setCompleted(false);
  }

  function changeMode(nextMode: TimerMode) {
    setMode(nextMode);
    setRunning(false);
    setEndAt(null);
    setSeconds(DURATIONS[nextMode]);
    setCompleted(false);
  }

  function formatTime(value: number) {
    const minutes = Math.floor(value / 60);
    const secs = value % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      secs
    ).padStart(2, "0")}`;
  }

  const progress =
    ((DURATIONS[mode] - seconds) / DURATIONS[mode]) * 100;

  const formattedTime = formatTime(seconds);

  return (
    <main className="desktop-overlay">
      <section className={`island ${expanded ? "expanded" : "compact"}`}>
        <header className="island-header" onMouseDown={handleDrag}>
          <div className="header-content">
            <span className="activity-symbol">
              {media?.isPlaying ? "♫" : mode === "focus" ? "◷" : "◌"}
            </span>

            <span className="activity-name">
              {media?.isPlaying
                ? media.title || "Now Playing"
                : running
                  ? mode === "focus"
                    ? "Focus"
                    : "Break"
                  : "IslandX"}
            </span>

            {(running || completed) && !media?.isPlaying && (
              <span className="activity-time">
                {completed ? "Done" : formatTime(seconds)}
              </span>
            )}
          </div>

          <button
            className="expand-control"
            onClick={() => setExpanded((previous) => !previous)}
            aria-label={expanded ? "Collapse island" : "Expand island"}
          >
            <span className={`chevron ${expanded ? "up" : "down"}`} />
          </button>
        </header>

        <div className="activity-panel">
          {/* Media Player Component */}
          <MediaPlayer
            media={media}
            mediaError={mediaError}
            mediaSessions={mediaSessions}
            selectedMediaSource={selectedMediaSource}
            onSelectSource={setSelectedMediaSource}
            onAction={mediaAction}
          />

          {/* Pomodoro Component */}
          <Pomodoro
            mode={mode}
            seconds={seconds}
            running={running}
            completed={completed}
            progress={progress}
            formattedTime={formattedTime}
            onChangeMode={changeMode}
            onStart={startTimer}
            onPause={pauseTimer}
            onReset={resetTimer}
          />

          <Utilities />

          {/* Additional activities */}
          <div className="more-activities">
            <button
              className="more-activities-toggle"
              onClick={() => setShowMoreActivities((previous) => !previous)}
            >
              <span>More activities</span>
              <span>{showMoreActivities ? "−" : "+"}</span>
            </button>

            {showMoreActivities && (
              <div className="activities-placeholder">
                <span>More features coming soon</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;