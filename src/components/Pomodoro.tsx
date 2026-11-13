type TimerMode = "focus" | "shortBreak" | "longBreak";

type Props = {
  mode: TimerMode;
  seconds: number;
  running: boolean;
  completed: boolean;
  progress: number;
  formattedTime: string;
  onChangeMode: (mode: TimerMode) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
};

export default function Pomodoro({
  mode,
  seconds,
  running,
  completed,
  progress,
  formattedTime,
  onChangeMode,
  onStart,
  onPause,
  onReset,
}: Props) {
  const labels: Record<TimerMode, string> = {
    focus: "Focus session",
    shortBreak: "Short break",
    longBreak: "Long break",
  };

  return (
    <>
      <div className="mode-selector">
        {(["focus", "shortBreak", "longBreak"] as TimerMode[]).map(
          (item) => (
            <button
              key={item}
              className={`mode-button ${mode === item ? "selected" : ""}`}
              onClick={() => onChangeMode(item)}
            >
              {item === "focus"
                ? "Focus"
                : item === "shortBreak"
                  ? "Short break"
                  : "Long break"}
            </button>
          )
        )}
      </div>

      <div className="timer-display">
        <span className="timer-label">
          {completed ? "SESSION COMPLETED" : labels[mode]}
        </span>

        <div className="timer-value">{formattedTime}</div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="timer-footer">
        <span className="timer-hint">
          {completed
            ? "Nice work. Take a moment."
            : running
              ? "Stay in the zone."
              : "Ready when you are."}
        </span>

        <div className="timer-controls">
          <button
            className="main-control"
            onClick={running ? onPause : onStart}
          >
            {running ? "Pause" : seconds === 0 ? "Restart" : "Start"}
          </button>

          <button
            className="reset-control"
            onClick={onReset}
            title="Reset timer"
            aria-label="Reset timer"
          >
            ↺
          </button>
        </div>
      </div>
    </>
  );
}