type MediaInfo = {
  title: string;
  artist: string;
  album: string;
  source: string;
  isPlaying: boolean;
  canNext: boolean;
  canPrevious: boolean;
};

type Props = {
  media: MediaInfo | null;
  mediaError: boolean;
  mediaSessions: MediaInfo[];
  selectedMediaSource: string;
  onSelectSource: (source: string) => void;
  onAction: (command: string) => void;
};

export default function MediaPlayer({
  media,
  mediaError,
  mediaSessions,
  selectedMediaSource,
  onSelectSource,
  onAction,
}: Props) {
  return (
    <>
      {mediaSessions.length > 1 && (
        <select
          className="media-source-select"
          value={selectedMediaSource}
          onChange={(event) => onSelectSource(event.target.value)}
        >
          {mediaSessions.map((session) => (
            <option key={session.source} value={session.source}>
              {session.source.split(".").pop() || session.source}
            </option>
          ))}
        </select>
      )}

      <div className="media-panel">
        <div className="media-details">
          <div className="media-artwork">♫</div>

          <div className="media-text">
            <span className="media-title">
              {media?.title ||
                (mediaError ? "Media unavailable" : "Nothing playing")}
            </span>

            <span className="media-artist">
              {media?.artist || media?.source || "Play something on Windows"}
            </span>
          </div>
        </div>

        <div className="media-controls">
          <button
            disabled={!media?.canPrevious}
            onClick={() => onAction("previous_media_track")}
            aria-label="Previous track"
            title="Previous"
          >
            ⏮
          </button>

          <button
            disabled={!media}
            onClick={() => onAction("toggle_media_playback")}
            aria-label={media?.isPlaying ? "Pause" : "Play"}
            title={media?.isPlaying ? "Pause" : "Play"}
          >
            {media?.isPlaying ? "Ⅱ" : "▶"}
          </button>

          <button
            disabled={!media?.canNext}
            onClick={() => onAction("next_media_track")}
            aria-label="Next track"
            title="Next"
          >
            ⏭
          </button>
        </div>
      </div>
    </>
  );
}