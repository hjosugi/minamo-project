use serde::Serialize;
#[cfg(not(test))]
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(not(test))]
use tauri_plugin_dialog::DialogExt;

use std::io::Read;
use std::path::Path;
#[cfg(not(test))]
use std::path::PathBuf;
#[cfg(not(test))]
use std::sync::Mutex;

const MAX_NATIVE_AVATAR_BYTES: u64 = 256 * 1024 * 1024;
const NATIVE_AVATAR_EXTENSIONS: &[&str] = &["inp", "inx", "vrm", "glb"];

#[cfg(not(test))]
#[derive(Default)]
struct NativeAvatarState {
    inner: Mutex<NativeAvatarStore>,
}

#[cfg(not(test))]
#[derive(Default)]
struct NativeAvatarStore {
    revision: u64,
    selection: Option<NativeAvatarSelection>,
}

#[cfg(not(test))]
#[derive(Clone)]
struct NativeAvatarSelection {
    path: PathBuf,
    info: NativeAvatarInfo,
}

#[cfg(not(test))]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAvatarInfo {
    name: String,
    format: String,
    byte_length: u64,
    revision: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopPage {
    name: &'static str,
    route: &'static str,
    bundled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStatus {
    runtime: &'static str,
    pages: Vec<DesktopPage>,
    virtual_camera: VirtualCameraStatus,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VirtualCameraStatus {
    os: &'static str,
    backend: &'static str,
    device: String,
    state: &'static str,
}

#[cfg_attr(not(test), tauri::command)]
fn desktop_status() -> DesktopStatus {
    DesktopStatus {
        runtime: "tauri desktop",
        pages: vec![
            DesktopPage {
                name: "Tracker",
                route: "tracker/index.html",
                bundled: true,
            },
            DesktopPage {
                name: "Viewer",
                route: "viewer/index.html",
                bundled: true,
            },
            DesktopPage {
                name: "Replay",
                route: "replay/index.html",
                bundled: true,
            },
        ],
        virtual_camera: virtual_camera_status(),
    }
}

#[cfg_attr(not(test), tauri::command)]
fn virtual_camera_status() -> VirtualCameraStatus {
    detect_virtual_camera_status()
}

#[cfg(not(test))]
#[tauri::command]
async fn open_tracker(app: AppHandle) -> Result<(), String> {
    open_app_window(
        &app,
        "tracker",
        "Minamo Tracker",
        "tracker/index.html",
        1180.0,
        820.0,
    )
}

#[cfg(not(test))]
#[tauri::command]
async fn open_viewer(app: AppHandle) -> Result<(), String> {
    open_app_window(
        &app,
        "viewer",
        "Minamo Viewer",
        "viewer/index.html",
        1220.0,
        860.0,
    )
}

#[cfg(not(test))]
#[tauri::command]
async fn open_replay(app: AppHandle) -> Result<(), String> {
    open_app_window(
        &app,
        "replay",
        "Minamo Replay",
        "replay/index.html",
        980.0,
        720.0,
    )
}

#[cfg(not(test))]
#[tauri::command]
async fn pick_native_avatar(
    app: AppHandle,
    state: tauri::State<'_, NativeAvatarState>,
) -> Result<Option<NativeAvatarInfo>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .add_filter("Minamo avatars", NATIVE_AVATAR_EXTENSIONS)
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| format!("Selected avatar is not a local file: {error}"))?
        .canonicalize()
        .map_err(|error| format!("Unable to resolve selected avatar: {error}"))?;
    let (name, format) = native_avatar_identity(&path)?;
    let byte_length = native_avatar_size(&path)?;

    let info = {
        let mut store = state
            .inner
            .lock()
            .map_err(|_| "Native avatar state is unavailable".to_string())?;
        store.revision = store.revision.wrapping_add(1).max(1);
        let info = NativeAvatarInfo {
            name,
            format,
            byte_length,
            revision: store.revision,
        };
        store.selection = Some(NativeAvatarSelection {
            path,
            info: info.clone(),
        });
        info
    };

    open_viewer(app.clone()).await?;
    if let Some(viewer) = app.get_webview_window("viewer") {
        viewer
            .emit("native-avatar-selected", info.clone())
            .map_err(|error| error.to_string())?;
    }
    Ok(Some(info))
}

#[cfg(not(test))]
#[tauri::command]
fn native_avatar_info(
    state: tauri::State<'_, NativeAvatarState>,
) -> Result<Option<NativeAvatarInfo>, String> {
    let store = state
        .inner
        .lock()
        .map_err(|_| "Native avatar state is unavailable".to_string())?;
    Ok(store
        .selection
        .as_ref()
        .map(|selection| selection.info.clone()))
}

#[cfg(not(test))]
#[tauri::command]
async fn read_native_avatar(
    revision: u64,
    state: tauri::State<'_, NativeAvatarState>,
) -> Result<tauri::ipc::Response, String> {
    let path = {
        let store = state
            .inner
            .lock()
            .map_err(|_| "Native avatar state is unavailable".to_string())?;
        let selection = store
            .selection
            .as_ref()
            .ok_or_else(|| "No native avatar has been selected".to_string())?;
        if selection.info.revision != revision {
            return Err("The native avatar selection changed; retry the load".to_string());
        }
        selection.path.clone()
    };
    native_avatar_identity(&path)?;
    let bytes = tauri::async_runtime::spawn_blocking(move || read_native_avatar_bytes(&path))
        .await
        .map_err(|error| format!("Native avatar read task failed: {error}"))??;
    Ok(tauri::ipc::Response::new(bytes))
}

fn native_avatar_identity(path: &Path) -> Result<(String, String), String> {
    let format = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|value| NATIVE_AVATAR_EXTENSIONS.contains(&value.as_str()))
        .ok_or_else(|| "Select an .inp, .inx, .vrm, or .glb avatar".to_string())?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Selected avatar has no valid file name".to_string())?
        .to_string();
    Ok((name, format))
}

fn native_avatar_size(path: &Path) -> Result<u64, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("Unable to inspect selected avatar: {error}"))?;
    if !metadata.is_file() {
        return Err("Selected avatar is not a regular file".to_string());
    }
    if metadata.len() == 0 {
        return Err("Selected avatar is empty".to_string());
    }
    if metadata.len() > MAX_NATIVE_AVATAR_BYTES {
        return Err("Selected avatar exceeds the 256 MiB native limit".to_string());
    }
    Ok(metadata.len())
}

fn read_native_avatar_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("Unable to open selected avatar: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Unable to inspect selected avatar: {error}"))?;
    if !metadata.is_file() {
        return Err("Selected avatar is not a regular file".to_string());
    }

    let mut bytes = Vec::with_capacity(metadata.len().min(MAX_NATIVE_AVATAR_BYTES) as usize);
    file.by_ref()
        .take(MAX_NATIVE_AVATAR_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read selected avatar: {error}"))?;
    if bytes.is_empty() {
        return Err("Selected avatar is empty".to_string());
    }
    if bytes.len() as u64 > MAX_NATIVE_AVATAR_BYTES {
        return Err("Selected avatar exceeds the 256 MiB native limit".to_string());
    }
    Ok(bytes)
}

#[cfg(not(test))]
fn open_app_window(
    app: &AppHandle,
    label: &'static str,
    title: &'static str,
    route: &'static str,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, label, WebviewUrl::App(route.into()))
        .title(title)
        .inner_size(width, height)
        .min_inner_size(760.0, 560.0)
        .build()
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn detect_virtual_camera_status() -> VirtualCameraStatus {
    virtual_camera_backend_for(
        current_os(),
        linux_loopback_loaded(),
        first_linux_video_device(),
    )
}

fn virtual_camera_backend_for(
    os: &'static str,
    linux_loopback_loaded: bool,
    linux_device: Option<String>,
) -> VirtualCameraStatus {
    match os {
        "linux" => VirtualCameraStatus {
            os,
            backend: "v4l2loopback",
            device: linux_device.unwrap_or_else(|| "no /dev/video device".to_string()),
            state: if linux_loopback_loaded {
                "driver loaded"
            } else {
                "driver not loaded"
            },
        },
        "windows" => VirtualCameraStatus {
            os,
            backend: "Media Foundation softcam",
            device: "not installed".to_string(),
            state: "backend not installed",
        },
        "macos" => VirtualCameraStatus {
            os,
            backend: "CoreMediaIO camera extension",
            device: "not installed".to_string(),
            state: "extension not installed",
        },
        _ => VirtualCameraStatus {
            os,
            backend: "unsupported",
            device: "not available".to_string(),
            state: "unavailable",
        },
    }
}

fn current_os() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        "other"
    }
}

#[cfg(target_os = "linux")]
fn linux_loopback_loaded() -> bool {
    std::path::Path::new("/sys/module/v4l2loopback").exists()
}

#[cfg(not(target_os = "linux"))]
fn linux_loopback_loaded() -> bool {
    false
}

#[cfg(target_os = "linux")]
fn first_linux_video_device() -> Option<String> {
    std::fs::read_dir("/dev")
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with("video"))
        .min()
        .map(|name| format!("/dev/{name}"))
}

#[cfg(not(target_os = "linux"))]
fn first_linux_video_device() -> Option<String> {
    None
}

#[cfg(not(test))]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(NativeAvatarState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            virtual_camera_status,
            open_tracker,
            open_viewer,
            open_replay,
            pick_native_avatar,
            native_avatar_info,
            read_native_avatar
        ])
        .run(tauri::generate_context!())
        .expect("error while running Minamo Studio");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_virtual_camera_status_reports_loopback_state() {
        let status = virtual_camera_backend_for("linux", true, Some("/dev/video2".to_string()));
        assert_eq!(status.os, "linux");
        assert_eq!(status.backend, "v4l2loopback");
        assert_eq!(status.device, "/dev/video2");
        assert_eq!(status.state, "driver loaded");
    }

    #[test]
    fn desktop_status_lists_offline_pages() {
        let status = desktop_status();
        let routes: Vec<_> = status.pages.iter().map(|page| page.route).collect();
        assert_eq!(
            routes,
            vec![
                "tracker/index.html",
                "viewer/index.html",
                "replay/index.html"
            ]
        );
    }

    #[test]
    fn native_avatar_identity_accepts_only_supported_extensions() {
        assert_eq!(
            native_avatar_identity(Path::new("Aka.INX")),
            Ok(("Aka.INX".to_string(), "inx".to_string()))
        );
        assert_eq!(
            native_avatar_identity(Path::new("avatar.vrm")),
            Ok(("avatar.vrm".to_string(), "vrm".to_string()))
        );
        assert!(native_avatar_identity(Path::new("notes.json")).is_err());
        assert!(native_avatar_identity(Path::new(".inp")).is_err());
    }

    #[test]
    fn native_avatar_reader_returns_local_bytes() {
        let path = std::env::temp_dir().join(format!(
            "minamo-native-avatar-reader-{}.inx",
            std::process::id()
        ));
        std::fs::write(&path, b"minamo-avatar").expect("write native avatar fixture");
        assert_eq!(native_avatar_size(&path), Ok(13));
        assert_eq!(
            read_native_avatar_bytes(&path),
            Ok(b"minamo-avatar".to_vec())
        );
        std::fs::remove_file(path).expect("remove native avatar fixture");
    }
}
