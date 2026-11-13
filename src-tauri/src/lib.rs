
use serde::Serialize;
use sysinfo::System;

#[cfg(target_os = "windows")]
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

// ==========================================
// MEDIA PLAYER
// ==========================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaInfo {
    source: String,
    title: String,
    artist: String,
    album: String,
    is_playing: bool,
    can_next: bool,
    can_previous: bool,
}

#[cfg(target_os = "windows")]
async fn get_manager(
) -> Result<GlobalSystemMediaTransportControlsSessionManager, String> {
    GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn find_session(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
    source: &str,
) -> Result<GlobalSystemMediaTransportControlsSession, String> {
    let sessions = manager.GetSessions().map_err(|e| e.to_string())?;

    for index in 0..sessions.Size().map_err(|e| e.to_string())? {
        let session = sessions.GetAt(index).map_err(|e| e.to_string())?;

        let app_id = session
            .SourceAppUserModelId()
            .map_err(|e| e.to_string())?
            .to_string();

        if app_id == source {
            return Ok(session);
        }
    }

    Err("Selected media session is no longer available".into())
}

#[cfg(target_os = "windows")]
async fn read_session(
    session: GlobalSystemMediaTransportControlsSession,
) -> Result<MediaInfo, String> {
    let source = session
        .SourceAppUserModelId()
        .map_err(|e| e.to_string())?
        .to_string();

    let properties = session
        .TryGetMediaPropertiesAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    let playback = session
        .GetPlaybackInfo()
        .map_err(|e| e.to_string())?;

    let status = playback
        .PlaybackStatus()
        .map_err(|e| e.to_string())?;

    let controls = playback
        .Controls()
        .map_err(|e| e.to_string())?;

    Ok(MediaInfo {
        source,
        title: properties.Title().map(|v| v.to_string()).unwrap_or_default(),
        artist: properties.Artist().map(|v| v.to_string()).unwrap_or_default(),
        album: properties.AlbumTitle().map(|v| v.to_string()).unwrap_or_default(),
        is_playing: status
            == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing,
        can_next: controls.IsNextEnabled().unwrap_or(false),
        can_previous: controls.IsPreviousEnabled().unwrap_or(false),
    })
}

#[tauri::command]
#[cfg(target_os = "windows")]
async fn get_media_sessions() -> Result<Vec<MediaInfo>, String> {
    let manager = get_manager().await?;

    let session_list = {
        let sessions = manager.GetSessions().map_err(|e| e.to_string())?;
        let count = sessions.Size().map_err(|e| e.to_string())?;

        let mut items = Vec::new();

        for index in 0..count {
            let session = sessions.GetAt(index).map_err(|e| e.to_string())?;
            items.push(session);
        }

        items
    };

    let mut result = Vec::new();

    for session in session_list {
        if let Ok(info) = read_session(session).await {
            result.push(info);
        }
    }

    let current_id = manager
        .GetCurrentSession()
        .ok()
        .and_then(|session| session.SourceAppUserModelId().ok())
        .map(|value| value.to_string());

    if let Some(current_id) = current_id {
        if let Some(index) = result.iter().position(|item| item.source == current_id) {
            result.swap(0, index);
        }
    }

    Ok(result)
}

#[tauri::command]
#[cfg(target_os = "windows")]
async fn get_media_info(source: String) -> Result<MediaInfo, String> {
    let manager = get_manager().await?;
    let session = find_session(&manager, &source)?;
    read_session(session).await
}

#[tauri::command]
#[cfg(target_os = "windows")]
async fn toggle_media_playback(source: String) -> Result<(), String> {
    let manager = get_manager().await?;
    let session = find_session(&manager, &source)?;

    let success = session
        .TryTogglePlayPauseAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    if !success {
        return Err("Playback toggle was not supported".into());
    }

    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
async fn next_media_track(source: String) -> Result<(), String> {
    let manager = get_manager().await?;
    let session = find_session(&manager, &source)?;

    let success = session
        .TrySkipNextAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    if !success {
        return Err("Next track is not supported by this session".into());
    }

    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
async fn previous_media_track(source: String) -> Result<(), String> {
    let manager = get_manager().await?;
    let session = find_session(&manager, &source)?;

    let success = session
        .TrySkipPreviousAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    if !success {
        return Err("Previous track is not supported by this session".into());
    }

    Ok(())
}

// ==========================================
// SYSTEM MONITOR
// ==========================================

#[derive(Debug, Serialize)]
struct SystemStats {
    cpu_usage: f32,
    memory_usage: f32,
    memory_used_gb: f64,
    memory_total_gb: f64,
    battery_percent: Option<f32>,
    battery_state: Option<String>,
}

#[tauri::command]
fn get_system_stats() -> Result<SystemStats, String> {
    let mut system =
        System::new_all().map_err(|e| e.to_string())?;

    system.refresh_cpu_usage();

    std::thread::sleep(std::time::Duration::from_millis(250));

    system.refresh_cpu_usage();
    system.refresh_memory();

    let total = system.total_memory() as f64;
    let used = system.used_memory() as f64;

    let (battery_percent, battery_state) =
        match battery::Manager::new() {
            Ok(manager) => match manager.batteries() {
                Ok(mut batteries) => match batteries.next() {
                    Some(Ok(bat)) => (
                        Some(bat.state_of_charge().value * 100.0),
                        Some(format!("{:?}", bat.state())),
                    ),
                    _ => (None, None),
                },
                Err(_) => (None, None),
            },
            Err(_) => (None, None),
        };

    Ok(SystemStats {
        cpu_usage: system.global_cpu_usage(),

        memory_usage: if total > 0.0 {
            (used / total * 100.0) as f32
        } else {
            0.0
        },

        memory_used_gb: used / 1_073_741_824.0,
        memory_total_gb: total / 1_073_741_824.0,

        battery_percent,
        battery_state,
    })
}

// ==========================================
// GENERAL COMMANDS
// ==========================================

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ==========================================
// TAURI APPLICATION
// ==========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_media_sessions,
            get_media_info,
            toggle_media_playback,
            next_media_track,
            previous_media_track,
            get_system_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
