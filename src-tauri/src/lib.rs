//! Tauri shell: exposes `tp-core` to the web UI as commands. All rules live in the core.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, State, WindowEvent};
use tp_core::model::{Booking, CancellationPolicy, Document, OptionBundle, Scenario, ScenarioSelection, TripGraph};
use tp_core::routing::{self, RoadQuery, RoadResult};
use tp_core::store::{AppInfo, BookingInput, CancelInput, Entity, EntityKind};
use tp_core::transfer::{self, BackupManifest, ImportMode, ImportPreview, RestorePreview};
use tp_core::{CoreError, ErrorPayload, Store};

struct AppState(Mutex<Store>);

type CmdResult<T> = Result<T, ErrorPayload>;

fn err(e: CoreError) -> ErrorPayload {
    ErrorPayload::from(&e)
}

/// Runs `f` with the store; commands are short, so one lock keeps every change serialized.
fn with<T>(state: &State<'_, AppState>, f: impl FnOnce(&mut Store) -> tp_core::CoreResult<T>) -> CmdResult<T> {
    let mut store = state.0.lock().map_err(|_| err(CoreError::rule("busy", "store unavailable")))?;
    f(&mut store).map_err(err)
}

#[tauri::command]
fn app_info(state: State<'_, AppState>) -> CmdResult<AppInfo> {
    with(&state, |s| s.app_info())
}

#[tauri::command]
fn set_setting(state: State<'_, AppState>, key: String, value: Option<String>) -> CmdResult<()> {
    with(&state, |s| s.set_setting(&key, value.as_deref()))
}

#[tauri::command]
fn list_trips(state: State<'_, AppState>) -> CmdResult<Vec<TripGraph>> {
    with(&state, |s| s.trip_graphs())
}

#[tauri::command]
fn get_trip(state: State<'_, AppState>, id: String) -> CmdResult<TripGraph> {
    with(&state, |s| s.trip_graph(&id))
}

#[tauri::command]
fn save(state: State<'_, AppState>, entity: Entity) -> CmdResult<()> {
    with(&state, |s| s.save(entity))
}

#[tauri::command]
fn delete(state: State<'_, AppState>, kind: EntityKind, keys: Vec<String>) -> CmdResult<()> {
    with(&state, |s| s.delete(kind, &keys))
}

#[tauri::command]
fn save_option(state: State<'_, AppState>, bundle: OptionBundle, confirm_booked_edit: bool) -> CmdResult<()> {
    with(&state, |s| s.save_option(bundle, confirm_booked_edit))
}

#[tauri::command]
fn duplicate_option(state: State<'_, AppState>, id: String, title: String) -> CmdResult<String> {
    with(&state, |s| s.duplicate_option(&id, &title))
}

#[tauri::command]
fn create_booking(state: State<'_, AppState>, input: BookingInput) -> CmdResult<String> {
    with(&state, |s| s.create_booking(input))
}

#[tauri::command]
fn update_booking(state: State<'_, AppState>, booking: Booking, policy: Option<CancellationPolicy>) -> CmdResult<()> {
    with(&state, |s| s.update_booking(booking, policy))
}

#[tauri::command]
fn cancel_booking(state: State<'_, AppState>, input: CancelInput) -> CmdResult<()> {
    with(&state, |s| s.cancel_booking(input))
}

#[tauri::command]
fn save_scenario(state: State<'_, AppState>, scenario: Scenario, selections: Vec<ScenarioSelection>) -> CmdResult<()> {
    with(&state, |s| s.save_scenario(scenario, selections))
}

#[tauri::command]
fn set_preferred_scenario(state: State<'_, AppState>, trip_id: String, scenario_id: Option<String>) -> CmdResult<()> {
    with(&state, |s| s.set_preferred_scenario(&trip_id, scenario_id.as_deref()))
}

#[tauri::command]
fn attach_document(
    state: State<'_, AppState>,
    trip_id: String,
    path: String,
    option_id: Option<String>,
    booking_id: Option<String>,
) -> CmdResult<Document> {
    with(&state, |s| s.attach_document(&trip_id, &PathBuf::from(path), option_id, booking_id))
}

#[tauri::command]
fn update_document_notes(state: State<'_, AppState>, id: String, notes: Option<String>) -> CmdResult<()> {
    with(&state, |s| s.update_document_notes(&id, notes))
}

/// Opens a stored document with the default app for its type.
#[tauri::command]
fn open_document(app: tauri::AppHandle, state: State<'_, AppState>, id: String) -> CmdResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = with(&state, |s| s.document_path(&id))?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| err(CoreError::rule("open_failed", e.to_string())))
}

/// Opens a web link in the system browser, after the same check that guards stored URLs.
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> CmdResult<()> {
    use tauri_plugin_opener::OpenerExt;
    tp_core::validate::url("url", &url).map_err(err)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| err(CoreError::rule("open_failed", e.to_string())))
}

#[tauri::command]
fn export_trip(state: State<'_, AppState>, trip_id: String, path: String) -> CmdResult<()> {
    with(&state, |s| s.export_trip(&trip_id, &PathBuf::from(path)))
}

#[tauri::command]
fn write_export(path: String, contents: String) -> CmdResult<()> {
    transfer::write_text_export(&PathBuf::from(path), &contents).map_err(err)
}

#[tauri::command]
fn preview_import(state: State<'_, AppState>, path: String) -> CmdResult<ImportPreview> {
    with(&state, |s| s.preview_import(&PathBuf::from(path)))
}

#[tauri::command]
fn import_trip(state: State<'_, AppState>, path: String, mode: ImportMode) -> CmdResult<String> {
    with(&state, |s| s.import_trip(&PathBuf::from(path), mode))
}

#[tauri::command]
fn create_backup(state: State<'_, AppState>, path: String) -> CmdResult<BackupManifest> {
    with(&state, |s| s.create_backup(&PathBuf::from(path)))
}

#[tauri::command]
fn preview_restore(state: State<'_, AppState>, path: String) -> CmdResult<RestorePreview> {
    with(&state, |s| s.preview_restore(&PathBuf::from(path)))
}

#[tauri::command]
fn restore_backup(state: State<'_, AppState>, path: String) -> CmdResult<String> {
    with(&state, |s| s.restore_backup(&PathBuf::from(path)))
}

/// Road routes for ground legs: answers from the cache, the rest from the route service. Only
/// sends coordinates when the user enabled routing; the store is not locked during requests.
#[tauri::command]
async fn road_routes(app: tauri::AppHandle, queries: Vec<RoadQuery>) -> CmdResult<Vec<RoadResult>> {
    let state = app.state::<AppState>();
    let (service, mut results) = with(&state, |s| {
        let config = s.routing_config()?;
        if !config.enabled {
            return Err(CoreError::rule("routing_disabled", "online routing is turned off"));
        }
        routing::validate_queries(&config.url, &queries)?;
        let cached = s.cached_roads(&config.url, &queries)?;
        Ok((config.url, cached))
    })?;
    let missing: Vec<usize> = (0..queries.len()).filter(|&i| results[i].is_none()).collect();
    if !missing.is_empty() {
        let user_agent = format!(
            "TravelPlanner/{} (+https://github.com/christian-terbeck/travel-planner)",
            app.package_info().version
        );
        let todo: Vec<RoadQuery> = missing.iter().map(|&i| queries[i]).collect();
        let url = service.clone();
        let fetched = tauri::async_runtime::spawn_blocking(move || {
            let mut out: Vec<(RoadQuery, RoadResult)> = Vec::with_capacity(todo.len());
            for q in todo {
                // The same leg twice in one plan (e.g. there and back on another day) is asked once.
                let r = match out.iter().find(|(p, _)| *p == q) {
                    Some((_, r)) => r.clone(),
                    None => routing::fetch(&url, q, &user_agent),
                };
                out.push((q, r));
            }
            out
        })
        .await
        .map_err(|e| err(CoreError::rule("busy", e.to_string())))?;

        with(&state, |s| {
            for (&i, (q, r)) in missing.iter().zip(&fetched) {
                s.cache_road(&service, *q, r)?;
                results[i] = Some(r.clone());
            }
            Ok(())
        })?;
    }
    Ok(results.into_iter().flatten().collect())
}

#[tauri::command]
fn clear_road_cache(state: State<'_, AppState>) -> CmdResult<usize> {
    with(&state, |s| s.clear_road_cache())
}

/// Shows a Windows notification (reminders computed by the UI).
#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> CmdResult<()> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| err(CoreError::rule("notify_failed", e.to_string())))
}

#[tauri::command]
fn autostart_enabled(app: tauri::AppHandle) -> CmdResult<bool> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| err(CoreError::rule("autostart_failed", e.to_string())))
}

/// Starts the app with Windows (in the tray, see `MINIMIZED_ARG`) or stops doing so.
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> CmdResult<()> {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    let result = if enabled { launcher.enable() } else { launcher.disable() };
    result.map_err(|e| err(CoreError::rule("autostart_failed", e.to_string())))
}

/// Passed when started with Windows: the window stays hidden and the app waits in the tray.
const MINIMIZED_ARG: &str = "--minimized";

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Closing the window keeps the app running in the tray when the user chose so, so that
/// reminders still arrive as notifications.
fn keeps_running_in_tray(app: &tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    let setting = state.0.lock().ok().and_then(|s| s.setting("close_to_tray").ok().flatten());
    setting.as_deref() == Some("1")
}

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Travel Planner", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit / Beenden", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Travel Planner")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Marker file that switches the app to portable mode.
const PORTABLE_MARKER: &str = "portable.txt";

/// In portable mode (marker file next to the executable) all data lives in `data\` beside it,
/// so the folder can be copied to another PC or a USB stick.
fn portable_data_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    dir.join(PORTABLE_MARKER).is_file().then(|| dir.join("data"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .setup(|app| {
            let data_dir = match portable_data_dir() {
                Some(dir) => dir,
                None => app.path().app_data_dir()?,
            };
            let store = Store::open(&data_dir)?;
            app.manage(AppState(Mutex::new(store)));
            create_tray(app)?;
            // The window starts hidden (see tauri.conf.json) to avoid a flash when started in the tray.
            if !std::env::args().any(|a| a == MINIMIZED_ARG) {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event
                && window.label() == "main"
                && keeps_running_in_tray(window.app_handle())
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            set_setting,
            list_trips,
            get_trip,
            save,
            delete,
            save_option,
            duplicate_option,
            create_booking,
            update_booking,
            cancel_booking,
            save_scenario,
            set_preferred_scenario,
            attach_document,
            update_document_notes,
            open_document,
            open_url,
            export_trip,
            write_export,
            preview_import,
            import_trip,
            create_backup,
            preview_restore,
            restore_backup,
            road_routes,
            clear_road_cache,
            notify,
            autostart_enabled,
            set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Travel Planner");
}
