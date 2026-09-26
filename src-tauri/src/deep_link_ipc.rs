//! Single-instance forwarding for Linux CEF.

use std::{
    io::{BufRead, BufReader, Write},
    os::unix::net::{UnixListener, UnixStream},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};

// OIDC uses the private-use `moe.sable.app:/login?...` form; other flows `sable://`.
const SCHEMES: &[&str] = &["moe.sable.app:", "sable:"];
const ACTIVATE: &str = "activate";

fn is_deep_link(arg: &str) -> bool {
    SCHEMES.iter().any(|scheme| arg.starts_with(scheme))
}

/// Stable socket path. Prefers $XDG_RUNTIME_DIR (per-user tmpfs, cleaned on
/// reboot); falls back to the temp dir.
fn socket_path() -> PathBuf {
    if let Ok(dir) = std::env::var("XDG_RUNTIME_DIR") {
        return PathBuf::from(dir).join("moe.sable.client-deeplink.sock");
    }
    std::env::temp_dir().join("moe.sable.client-deeplink.sock")
}

fn collect_deep_link_urls_from_args<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .skip(1)
        .filter_map(|arg| {
            let arg = arg.as_ref();
            is_deep_link(arg).then(|| arg.to_string())
        })
        .collect()
}

pub enum ForwardResult {
    /// The launch was written to the primary's socket; the caller must exit(0).
    Forwarded,
    /// No primary is listening, so the caller must become primary.
    NoPrimary,
}

/// Forward a launch to the primary before CEF initialization.
pub fn try_forward_to_primary() -> ForwardResult {
    let urls = collect_deep_link_urls_from_args(std::env::args());
    let path = socket_path();
    match UnixStream::connect(&path) {
        Ok(mut stream) => {
            stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
            let _ = writeln!(stream, "{ACTIVATE}");
            for url in &urls {
                let _ = writeln!(stream, "{url}");
            }
            log::info!(
                "[deep-link-ipc] forwarded launch with {} URL(s) to primary",
                urls.len()
            );
            ForwardResult::Forwarded
        }
        Err(_) => ForwardResult::NoPrimary,
    }
}

enum LaunchMessage {
    Activate,
    DeepLink(String),
}

static PENDING_MESSAGES: OnceLock<Arc<Mutex<Vec<LaunchMessage>>>> = OnceLock::new();
type LiveHandler = Box<dyn Fn(LaunchMessage) + Send + Sync>;
static LIVE_HANDLER: OnceLock<Mutex<Option<LiveHandler>>> = OnceLock::new();

fn pending_queue() -> &'static Arc<Mutex<Vec<LaunchMessage>>> {
    PENDING_MESSAGES.get_or_init(|| Arc::new(Mutex::new(Vec::new())))
}
fn live_handler() -> &'static Mutex<Option<LiveHandler>> {
    LIVE_HANDLER.get_or_init(|| Mutex::new(None))
}

/// Query/fragment carry OIDC tokens — never log them.
fn redact_for_log(url: &str) -> String {
    url.split(['?', '#'])
        .next()
        .unwrap_or("<deep link>")
        .to_string()
}

fn dispatch(message: LaunchMessage) {
    if let Ok(guard) = live_handler().lock() {
        if let Some(handler) = guard.as_ref() {
            handler(message);
            return;
        }
    }
    if let Ok(mut q) = pending_queue().lock() {
        q.push(message);
    }
}

/// Removes the socket file on drop.
pub struct DeepLinkSocketGuard {
    path: PathBuf,
}
impl Drop for DeepLinkSocketGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Bind the socket and spawn the listener thread. Returns `None` if a live
/// primary already holds it (or on error) — non-fatal.
pub fn bind_and_listen() -> Option<DeepLinkSocketGuard> {
    let path = socket_path();
    let listener = match UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => match UnixStream::connect(&path) {
            Ok(_) => return None, // live primary already running
            Err(_) => {
                let _ = std::fs::remove_file(&path); // stale socket from a crash
                UnixListener::bind(&path).ok()?
            }
        },
        Err(e) => {
            log::warn!("[deep-link-ipc] failed to bind {}: {e}", path.display());
            return None;
        }
    };

    std::thread::Builder::new()
        .name("deep-link-ipc".into())
        .spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => handle_connection(stream),
                    Err(_) => break,
                }
            }
        })
        .ok();
    Some(DeepLinkSocketGuard { path })
}

fn handle_connection(stream: UnixStream) {
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();
    for line in BufReader::new(stream).lines() {
        match line {
            Ok(line) if line == ACTIVATE => dispatch(LaunchMessage::Activate),
            Ok(url) if is_deep_link(&url) => {
                log::info!("[deep-link-ipc] received {}", redact_for_log(&url));
                dispatch(LaunchMessage::DeepLink(url));
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
}

// The event tauri-plugin-deep-link's onOpenUrl listens to. Kept out of the
// emit call as a const so tauri-typegen doesn't emit a binding for it (the
// `://` can't form a valid identifier).
const NEW_URL_EVENT: &str = "deep-link://new-url";

pub fn drain_pending_launches<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::{Emitter, Manager};

    let app_for_handler = app.clone();
    if let Ok(mut guard) = live_handler().lock() {
        *guard = Some(Box::new(move |message| match message {
            LaunchMessage::Activate => {
                if let Some(window) = app_for_handler.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            LaunchMessage::DeepLink(url) => {
                if let Err(e) = app_for_handler.emit(NEW_URL_EVENT, vec![url]) {
                    log::warn!("[deep-link-ipc] emit failed: {e}");
                }
            }
        }));
    }

    let pending: Vec<LaunchMessage> = pending_queue()
        .lock()
        .map(|mut q| std::mem::take(&mut *q))
        .unwrap_or_default();
    for message in pending {
        match message {
            LaunchMessage::Activate => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            LaunchMessage::DeepLink(url) => {
                let _ = app.emit(NEW_URL_EVENT, vec![url]);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        collect_deep_link_urls_from_args, handle_connection, live_handler, LaunchMessage, ACTIVATE,
    };
    use std::{
        io::Write,
        os::unix::net::UnixStream,
        sync::{Arc, Mutex},
    };

    #[test]
    fn regular_launch_activates_the_primary() {
        let activated = Arc::new(Mutex::new(false));
        let received = activated.clone();
        *live_handler().lock().unwrap() = Some(Box::new(move |message| {
            if matches!(message, LaunchMessage::Activate) {
                *received.lock().unwrap() = true;
            }
        }));

        let (reader, mut writer) = UnixStream::pair().unwrap();
        writeln!(writer, "{ACTIVATE}").unwrap();
        drop(writer);
        handle_connection(reader);

        assert!(*activated.lock().unwrap());
    }

    #[test]
    fn collects_only_supported_deep_links() {
        assert_eq!(
            collect_deep_link_urls_from_args(["sable", "--flag", "sable://room", "https://x"]),
            ["sable://room"]
        );
    }
}
