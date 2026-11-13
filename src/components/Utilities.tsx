
import { useEffect, useState } from "react";
import { evaluate } from "mathjs";
import {
  readText,
  writeText,
} from "@tauri-apps/plugin-clipboard-manager";
import { invoke } from "@tauri-apps/api/core";

type Tab = "calculator" | "clipboard" | "notes" | "system";

type SystemStats = {
  cpu_usage: number;
  memory_usage: number;
  memory_used_gb: number;
  memory_total_gb: number;
  battery_percent: number | null;
  battery_state: string | null;
};

const CLIPBOARD_KEY = "islandx-clipboard-history";
const NOTES_KEY = "islandx-quick-notes";

function Calculator() {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");

  function calculate() {
    try {
      if (!expression.trim()) return;

      const value = evaluate(expression);

      if (typeof value !== "number" || !Number.isFinite(value)) {
        setResult("Invalid expression");
        return;
      }

      setResult(String(Number(value.toPrecision(12))));
    } catch {
      setResult("Invalid expression");
    }
  }

  async function copyResult() {
    if (!result || result === "Invalid expression") return;
    await writeText(result);
  }

  return (
    <div className="utility-content">
      <div className="calculator-display">
        <input
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") calculate();

            if (e.key === "Escape") {
              setExpression("");
              setResult("");
            }
          }}
          placeholder="Enter an expression..."
          aria-label="Calculator expression"
        />

        <div className="calculator-result">{result || "Result"}</div>
      </div>

      <div className="calculator-buttons">
        {[
          "7", "8", "9", "/",
          "4", "5", "6", "*",
          "1", "2", "3", "-",
          "0", ".", "(", ")",
          "+", "%",
        ].map((item) => (
          <button
            key={item}
            onClick={() => setExpression((current) => current + item)}
          >
            {item}
          </button>
        ))}

        <button onClick={() => setExpression("")}>Clear</button>
        <button className="utility-primary" onClick={calculate}>
          Calculate
        </button>
        <button onClick={copyResult}>Copy</button>
      </div>
    </div>
  );
}

function ClipboardHistory() {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [monitoring, setMonitoring] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!monitoring) return;

    let active = true;

    const checkClipboard = async () => {
      try {
        const text = await readText();

        if (!active || !text?.trim() || text.length > 5000) return;

        setHistory((current) => {
          if (current[0] === text) return current;
          return [text, ...current].slice(0, 30);
        });
      } catch (error) {
        console.error("Clipboard read failed:", error);
      }
    };

    checkClipboard();

    const interval = window.setInterval(checkClipboard, 1200);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [monitoring]);

  async function copyItem(item: string) {
    try {
      await writeText(item);
      setMessage("Copied");
      window.setTimeout(() => setMessage(""), 1500);
    } catch {
      setMessage("Copy failed");
    }
  }

  return (
    <div className="utility-content">
      <div className="utility-toolbar">
        <span className="utility-description">
          {monitoring
            ? "Monitoring clipboard"
            : "Clipboard monitoring is off"}
        </span>

        <button
          className={monitoring ? "utility-primary" : ""}
          onClick={() => setMonitoring((value) => !value)}
        >
          {monitoring ? "Stop" : "Start"}
        </button>
      </div>

      {message && <div className="utility-feedback">{message}</div>}

      <div className="clipboard-list">
        {history.length === 0 ? (
          <div className="utility-empty">
            Start monitoring to collect copied text.
          </div>
        ) : (
          history.map((item, index) => (
            <div
              className="clipboard-item"
              key={`${index}-${item.slice(0, 20)}`}
            >
              <span>{item}</span>
              <button onClick={() => copyItem(item)}>Copy</button>
            </div>
          ))
        )}
      </div>

      <button
        className="utility-clear"
        onClick={() => {
          setHistory([]);
          localStorage.removeItem(CLIPBOARD_KEY);
        }}
      >
        Clear history
      </button>
    </div>
  );
}

function QuickNotes() {
  const [note, setNote] = useState(
    () => localStorage.getItem(NOTES_KEY) || ""
  );

  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setSaved(false);

    const timeout = window.setTimeout(() => {
      localStorage.setItem(NOTES_KEY, note);
      setSaved(true);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [note]);

  return (
    <div className="utility-content">
      <textarea
        className="quick-notes-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Write something down..."
      />

      <div className="notes-footer">
        <span>{saved ? "Saved locally" : "Saving..."}</span>

        <button
          onClick={() => {
            setNote("");
            localStorage.removeItem(NOTES_KEY);
          }}
        >
          Clear note
        </button>
      </div>
    </div>
  );
}

function SystemMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function updateStats() {
      try {
        const result = await invoke<SystemStats>("get_system_stats");

        if (active) {
          setStats(result);
          setError(null);
        }
      } catch (err) {
        console.error("System stats failed:", err);

        if (active) {
          setError(String(err));
        }
      }
    }

    updateStats();

    const interval = window.setInterval(updateStats, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="utility-empty">
        <strong>System monitor error</strong>
        <p>{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="utility-empty">
        Loading system information...
      </div>
    );
  }

  const metrics = [
    {
      label: "CPU",
      value: stats.cpu_usage,
      detail: `${stats.cpu_usage.toFixed(1)}%`,
    },
    {
      label: "Memory",
      value: stats.memory_usage,
      detail: `${stats.memory_used_gb.toFixed(1)} / ${stats.memory_total_gb.toFixed(1)} GB`,
    },
  ];

  return (
    <div className="utility-content">
      {metrics.map((metric) => (
        <div className="system-metric" key={metric.label}>
          <div className="system-metric-heading">
            <span>{metric.label}</span>
            <span>{metric.detail}</span>
          </div>

          <div className="system-track">
            <div
              className="system-fill"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(0, metric.value)
                )}%`,
              }}
            />
          </div>
        </div>
      ))}

      <div className="battery-card">
        <span>Battery</span>

        <strong>
          {stats.battery_percent === null
            ? "Unavailable"
            : `${stats.battery_percent.toFixed(0)}%`}
        </strong>

        <span>{stats.battery_state || "No battery information"}</span>
      </div>
    </div>
  );
}

export default function Utilities() {
  const [activeTab, setActiveTab] = useState<Tab>("calculator");

  const tabs: { id: Tab; label: string }[] = [
    { id: "calculator", label: "Calculator" },
    { id: "clipboard", label: "Clipboard" },
    { id: "notes", label: "Notes" },
    { id: "system", label: "System" },
  ];

  return (
    <section className="utilities-panel">
      <div className="utilities-heading">
        <span>Utilities</span>
        <span className="utilities-version">4 tools</span>
      </div>

      <div className="utilities-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "calculator" && <Calculator />}
      {activeTab === "clipboard" && <ClipboardHistory />}
      {activeTab === "notes" && <QuickNotes />}
      {activeTab === "system" && <SystemMonitor />}
    </section>
  );
}
