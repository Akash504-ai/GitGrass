
export type WidgetPreferences = {
  mediaPlayer: boolean;
  pomodoro: boolean;
  utilities: boolean;
};

type Props = {
  preferences: WidgetPreferences;
  onChange: (key: keyof WidgetPreferences, value: boolean) => void;
  onReset: () => void;
  onClose: () => void;
};

const WIDGETS: {
  key: keyof WidgetPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: "mediaPlayer",
    label: "Media Player",
    description: "Control music and media playback",
  },
  {
    key: "pomodoro",
    label: "Pomodoro",
    description: "Focus sessions and break timer",
  },
  {
    key: "utilities",
    label: "Utilities",
    description: "Calculator, clipboard, notes and system monitor",
  },
];

export default function WidgetSettings({
  preferences,
  onChange,
  onReset,
  onClose,
}: Props) {
  return (
    <section className="widget-settings">
      <div className="widget-settings-header">
        <div>
          <h3>Customize IslandX</h3>
          <p>Choose what appears in your island.</p>
        </div>

        <button
          className="settings-close"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      <div className="widget-settings-list">
        {WIDGETS.map((widget) => (
          <div className="widget-setting-item" key={widget.key}>
            <div className="widget-setting-info">
              <span>{widget.label}</span>
              <small>{widget.description}</small>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={preferences[widget.key]}
              className={`widget-switch ${
                preferences[widget.key] ? "enabled" : ""
              }`}
              onClick={() =>
                onChange(widget.key, !preferences[widget.key])
              }
            >
              <span />
            </button>
          </div>
        ))}
      </div>

      <div className="widget-settings-footer">
        <button onClick={onReset}>Reset defaults</button>
        <button className="settings-done" onClick={onClose}>
          Done
        </button>
      </div>
    </section>
  );
}
