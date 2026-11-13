
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

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
import Utilities from "./components/Utilities";

import WidgetSettings, {
  type WidgetPreferences,
} from "./components/WidgetSettings";

import "./App.css";

// ==========================================
// TYPES
// ==========================================

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

// ==========================================
// CONSTANTS
// ==========================================

const DURATIONS: Record<TimerMode, number> = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const POSITION_KEY = "islandx-window-position-v2";
const WIDGETS_STORAGE_KEY = "islandx-widget-preferences";

const DEFAULT_WIDGETS: WidgetPreferences = {
  mediaPlayer: true,
  pomodoro: true,
  utilities: true,
};

// ==========================================
// APP
// ==========================================

function App() {
  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const activityPanelRef = useRef<HTMLDivElement | null>(null);

  // ------------------------------------------
  // Widget preferences
  // ------------------------------------------

  const [widgetPreferences, setWidgetPreferences] =
    useState<WidgetPreferences>(() => {
      try {
        const saved = localStorage.getItem(WIDGETS_STORAGE_KEY);

        if (!saved) return DEFAULT_WIDGETS;

        const parsed = JSON.parse(saved);

        return {
          mediaPlayer:
            typeof parsed.mediaPlayer === "boolean"
              ? parsed.mediaPlayer
              : true,

          pomodoro:
            typeof parsed.pomodoro === "boolean"
              ? parsed.pomodoro
              : true,

          utilities:
            typeof parsed.utilities === "boolean"
              ? parsed.utilities
              : true,
        };
      } catch {
        return DEFAULT_WIDGETS;
      }
    });

  useEffect(() => {
    localStorage.setItem(
      WIDGETS_STORAGE_KEY,
      JSON.stringify(widgetPreferences)
    );
  }, [widgetPreferences]);

  function updateWidgetPreference(
    key: keyof WidgetPreferences,
    value: boolean
  ) {
    setWidgetPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetWidgetPreferences() {
    setWidgetPreferences(DEFAULT_WIDGETS);
  }

  // ------------------------------------------
  // Pomodoro state
  // ------------------------------------------

  const [mode, setMode] = useState<TimerMode>("focus");
  const [seconds, setSeconds] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);

  // ------------------------------------------
  // Media state
  // ------------------------------------------

  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [mediaSessions, setMediaSessions] = useState<MediaInfo[]>([]);
  const [selectedMediaSource, setSelectedMediaSource] = useState("");

  // ------------------------------------------
  // Media functions
  // ------------------------------------------

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

  // ------------------------------------------
  // Dynamic native window sizing
  // ------------------------------------------

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    let animationFrame = 0;

    async function resizeNativeWindow(height: number) {
      try {
        const win = getCurrentWindow();

        const position = await win.outerPosition();
        const currentSize = await win.outerSize();

        if (cancelled) return;

        const centerX = position.x + currentSize.width / 2;

        const targetHeight = Math.min(
          800,
          Math.max(43, Math.ceil(height))
        );

        const targetSize = expanded
          ? new LogicalSize(420, targetHeight)
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
        console.error("Automatic window resize failed:", error);
      }
    }

    if (!expanded) {
      resizeNativeWindow(43);

      return () => {
        cancelled = true;
        cancelAnimationFrame(animationFrame);
      };
    }

    const panel = activityPanelRef.current;

    if (!panel) {
      return () => {
        cancelled = true;
      };
    }

    function measureContent() {
      cancelAnimationFrame(animationFrame);

      animationFrame = requestAnimationFrame(() => {
        if (cancelled) return;

        const headerHeight = 43;
        const panelHeight = panel.scrollHeight;
        const extraSpacing = 4;

        resizeNativeWindow(
          headerHeight + panelHeight + extraSpacing
        );
      });
    }

    measureContent();

    resizeObserver = new ResizeObserver(measureContent);
    resizeObserver.observe(panel);

    // Also detect content changes inside the panel.
    const mutationObserver = new MutationObserver(measureContent);

    mutationObserver.observe(panel, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [expanded, showSettings, widgetPreferences]);

  // ------------------------------------------
  // Restore saved window position
  // ------------------------------------------

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

  // ------------------------------------------
  // Native window dragging
  // ------------------------------------------

  async function handleDrag(event: ReactMouseEvent<HTMLElement>) {
    if (event.button !== 0) return;

    if (
      (event.target as HTMLElement).closest(
        "button, select, input, textarea"
      )
    ) {
      return;
    }

    try {
      await getCurrentWindow().startDragging();
    } catch (error) {
      console.error("Dragging failed:", error);
    }
  }

  // ------------------------------------------
  // Pomodoro countdown
  // ------------------------------------------

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

  // ------------------------------------------
  // UI
  // ------------------------------------------

  return (
    <main className="desktop-overlay">
      <section className={`island ${expanded ? "expanded" : "compact"}`}>
        <header className="island-header" onMouseDown={handleDrag}>
          <div className="header-content">
            <span className="activity-symbol">
              {media?.isPlaying
                ? "♫"
                : mode === "focus"
                  ? "◷"
                  : "◌"}
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
                {completed ? "Done" : formattedTime}
              </span>
            )}
          </div>

          <div className="header-controls">
            <button
              className="settings-control"
              onClick={() => {
                setShowSettings((previous) => !previous);
                setExpanded(true);
              }}
              aria-label="Customize IslandX"
              title="Customize IslandX"
            >
              ⚙
            </button>

            <button
              className="expand-control"
              onClick={() => setExpanded((previous) => !previous)}
              aria-label={expanded ? "Collapse island" : "Expand island"}
            >
              <span className={`chevron ${expanded ? "up" : "down"}`} />
            </button>
          </div>
        </header>

        {expanded && (
          <div className="activity-panel" ref={activityPanelRef}>
            {showSettings ? (
              <WidgetSettings
                preferences={widgetPreferences}
                onChange={updateWidgetPreference}
                onReset={resetWidgetPreferences}
                onClose={() => setShowSettings(false)}
              />
            ) : (
              <>
                {widgetPreferences.mediaPlayer && (
                  <MediaPlayer
                    media={media}
                    mediaError={mediaError}
                    mediaSessions={mediaSessions}
                    selectedMediaSource={selectedMediaSource}
                    onSelectSource={setSelectedMediaSource}
                    onAction={mediaAction}
                  />
                )}

                {widgetPreferences.pomodoro && (
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
                )}

                {widgetPreferences.utilities && <Utilities />}

                {!widgetPreferences.mediaPlayer &&
                  !widgetPreferences.pomodoro &&
                  !widgetPreferences.utilities && (
                    <div className="utility-empty">
                      No widgets enabled. Open settings to add widgets.
                    </div>
                  )}
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
