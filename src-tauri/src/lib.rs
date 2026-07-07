use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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

#[tauri::command]
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

#[tauri::command]
fn virtual_camera_status() -> VirtualCameraStatus {
    detect_virtual_camera_status()
}

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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            virtual_camera_status,
            open_tracker,
            open_viewer,
            open_replay
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
}
