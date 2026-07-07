// Minamo relay (Rust, WebTransport).
// The low-latency path: KGM1 frames travel as QUIC datagrams.
// Datagrams are unreliable and unordered by design. A late pose frame is a
// useless pose frame, so we never retransmit; the next frame replaces it.
//
// Rooms: the URL path selects a room and a role.
//   https://host:4433/room/<room>/pub   -> publisher (tracker)
//   https://host:4433/room/<room>/sub   -> subscriber (viewer)
//   https://host:4433/room/<room>/<token>/<pub|sub> when MINAMO_RELAY_TOKEN is set
//
// TLS: on startup the server generates a self-signed certificate valid for
// browsers via `serverCertificateHashes` and prints its SHA-256 hash.
// Paste that hash into the "cert sha-256" field in the tracker / viewer UI.
// Regenerate by restarting; browsers only accept such certs for <= 14 days.
//
// Run: cargo run --release

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex};
use wtransport::endpoint::IncomingSession;
use wtransport::tls::Sha256DigestFmt;
use wtransport::{Endpoint, Identity, ServerConfig};

const PORT: u16 = 4433;
const ROOM_CAPACITY: usize = 512; // frames buffered per room before lagging subs drop
const METRICS_ADDR: &str = "127.0.0.1:9487";

struct Room {
    tx: broadcast::Sender<Vec<u8>>,
    participants: usize,
}

type Rooms = Arc<Mutex<HashMap<String, Room>>>;

#[derive(Default)]
struct RelayMetrics {
    sessions_total: AtomicU64,
    active_sessions: AtomicU64,
    frames_in_total: AtomicU64,
    frames_out_total: AtomicU64,
    frames_dropped_newest_only_total: AtomicU64,
    auth_failures_total: AtomicU64,
}

type Metrics = Arc<RelayMetrics>;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let identity = Identity::self_signed(["localhost", "127.0.0.1", "::1"])?;
    let digest = identity.certificate_chain().as_slice()[0].hash();

    let config = ServerConfig::builder()
        .with_bind_default(PORT)
        .with_identity(identity)
        .keep_alive_interval(Some(std::time::Duration::from_secs(3)))
        .build();

    let endpoint = Endpoint::server(config)?;
    let rooms: Rooms = Arc::new(Mutex::new(HashMap::new()));
    let metrics: Metrics = Arc::new(RelayMetrics::default());
    let relay_token = Arc::new(
        std::env::var("MINAMO_RELAY_TOKEN")
            .or_else(|_| std::env::var("ROOM_TOKEN"))
            .unwrap_or_default(),
    );
    let metrics_addr =
        std::env::var("MINAMO_METRICS_ADDR").unwrap_or_else(|_| METRICS_ADDR.to_string());
    if metrics_addr != "off" {
        tokio::spawn(metrics_server(
            metrics.clone(),
            rooms.clone(),
            metrics_addr.clone(),
        ));
    }

    println!("Minamo relay-rs (WebTransport)");
    println!("  url  : https://localhost:{PORT}/room/<room>/<pub|sub>");
    if metrics_addr != "off" {
        println!("  metrics: http://{metrics_addr}/metrics");
    }
    println!("  cert sha-256 (paste into the tracker/viewer UI):");
    println!("    {}", digest.fmt(Sha256DigestFmt::DottedHex));
    println!("  note : self-signed; restart regenerates it (14-day browser limit)");

    loop {
        tokio::select! {
            incoming = endpoint.accept() => {
                let rooms = rooms.clone();
                let relay_token = relay_token.clone();
                let metrics = metrics.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_session(incoming, rooms, relay_token, metrics).await {
                        log_event("session_error", &[("error", e.to_string())]);
                    }
                });
            }
            _ = tokio::signal::ctrl_c() => {
                println!("shutting down");
                break;
            }
        }
    }
    Ok(())
}

async fn handle_session(
    incoming: IncomingSession,
    rooms: Rooms,
    relay_token: Arc<String>,
    metrics: Metrics,
) -> anyhow::Result<()> {
    let request = incoming.await?;
    let path = request.path().to_string();

    // expected path: /room/<room>/<pub|sub>
    // authenticated path: /room/<room>/<token>/<pub|sub>
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    let (room, token, role) = match parts.as_slice() {
        ["room", room, role] => ((*room).to_string(), "", (*role).to_string()),
        ["room", room, token, role] => ((*room).to_string(), *token, (*role).to_string()),
        _ => {
            request.not_found().await;
            return Ok(());
        }
    };
    if !relay_token.is_empty() && !constant_time_equal(token, relay_token.as_str()) {
        metrics.auth_failures_total.fetch_add(1, Ordering::Relaxed);
        log_event("auth_failure", &[("room", room), ("role", role)]);
        request.forbidden().await;
        return Ok(());
    }
    if role != "pub" && role != "sub" {
        request.not_found().await;
        return Ok(());
    }

    let connection = request.accept().await?;
    metrics.sessions_total.fetch_add(1, Ordering::Relaxed);
    metrics.active_sessions.fetch_add(1, Ordering::Relaxed);
    log_event("join", &[("room", room.clone()), ("role", role.clone())]);

    let tx = {
        let mut map = rooms.lock().await;
        let entry = map.entry(room.clone()).or_insert_with(|| Room {
            tx: broadcast::channel(ROOM_CAPACITY).0,
            participants: 0,
        });
        entry.participants += 1;
        entry.tx.clone()
    };

    match role.as_str() {
        "pub" => {
            // Publisher: every received datagram fans out to the room.
            while let Ok(dgram) = connection.receive_datagram().await {
                metrics.frames_in_total.fetch_add(1, Ordering::Relaxed);
                let _ = tx.send(dgram.to_vec());
            }
        }
        "sub" => {
            // Subscriber: forward the room feed as datagrams.
            let mut rx = tx.subscribe();
            loop {
                tokio::select! {
                    msg = rx.recv() => match msg {
                        Ok(frame) => {
                            let frame = drain_newest(&mut rx, frame, &metrics);
                            if connection.send_datagram(&frame).is_err() {
                                break;
                            }
                            metrics.frames_out_total.fetch_add(1, Ordering::Relaxed);
                        }
                        // Slow subscriber: skip the missed frames and continue.
                        Err(broadcast::error::RecvError::Lagged(skipped)) => {
                            metrics.frames_dropped_newest_only_total.fetch_add(skipped, Ordering::Relaxed);
                            continue;
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                    // Detect the peer going away even while the room is idle.
                    received = connection.receive_datagram() => {
                        if received.is_err() {
                            break;
                        }
                    }
                }
            }
        }
        _ => {
            // Unknown role; drop the session.
        }
    }

    metrics.active_sessions.fetch_sub(1, Ordering::Relaxed);
    log_event("leave", &[("room", room.clone()), ("role", role.clone())]);
    gc_room(&rooms, &room).await;
    Ok(())
}

async fn gc_room(rooms: &Rooms, room: &str) {
    let mut map = rooms.lock().await;
    if let Some(state) = map.get_mut(room) {
        state.participants = state.participants.saturating_sub(1);
        if state.participants == 0 {
            map.remove(room);
        }
    }
}

fn drain_newest(
    rx: &mut broadcast::Receiver<Vec<u8>>,
    first: Vec<u8>,
    metrics: &RelayMetrics,
) -> Vec<u8> {
    let mut newest = first;
    while let Ok(frame) = rx.try_recv() {
        metrics
            .frames_dropped_newest_only_total
            .fetch_add(1, Ordering::Relaxed);
        newest = frame;
    }
    newest
}

async fn metrics_server(metrics: Metrics, rooms: Rooms, addr: String) {
    let listener = match TcpListener::bind(&addr).await {
        Ok(listener) => listener,
        Err(error) => {
            log_event(
                "metrics_bind_error",
                &[("addr", addr), ("error", error.to_string())],
            );
            return;
        }
    };
    loop {
        let (mut stream, _) = match listener.accept().await {
            Ok(pair) => pair,
            Err(error) => {
                log_event("metrics_accept_error", &[("error", error.to_string())]);
                continue;
            }
        };
        let metrics = metrics.clone();
        let rooms = rooms.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let read = stream.read(&mut buf).await.unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..read]);
            let path = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("/");
            if path != "/metrics" {
                let _ = stream
                    .write_all(b"HTTP/1.1 404 Not Found\r\ncontent-length: 9\r\n\r\nnot found")
                    .await;
                return;
            }
            let room_count = rooms.lock().await.len() as u64;
            let body = render_metrics(&metrics, room_count);
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: text/plain; version=0.0.4\r\ncontent-length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes()).await;
        });
    }
}

fn render_metrics(metrics: &RelayMetrics, room_count: u64) -> String {
    format!(
        concat!(
            "# HELP minamo_relay_sessions_total Total accepted WebTransport sessions.\n",
            "# TYPE minamo_relay_sessions_total counter\n",
            "minamo_relay_sessions_total {}\n",
            "# HELP minamo_relay_active_sessions Active WebTransport sessions.\n",
            "# TYPE minamo_relay_active_sessions gauge\n",
            "minamo_relay_active_sessions {}\n",
            "# HELP minamo_relay_rooms Active relay rooms.\n",
            "# TYPE minamo_relay_rooms gauge\n",
            "minamo_relay_rooms {}\n",
            "# HELP minamo_relay_frames_in_total Motion datagrams received from publishers.\n",
            "# TYPE minamo_relay_frames_in_total counter\n",
            "minamo_relay_frames_in_total {}\n",
            "# HELP minamo_relay_frames_out_total Motion datagrams sent to subscribers.\n",
            "# TYPE minamo_relay_frames_out_total counter\n",
            "minamo_relay_frames_out_total {}\n",
            "# HELP minamo_relay_frames_dropped_newest_only_total Stale frames replaced by newest-only delivery.\n",
            "# TYPE minamo_relay_frames_dropped_newest_only_total counter\n",
            "minamo_relay_frames_dropped_newest_only_total {}\n",
            "# HELP minamo_relay_auth_failures_total Room-token authentication failures.\n",
            "# TYPE minamo_relay_auth_failures_total counter\n",
            "minamo_relay_auth_failures_total {}\n",
        ),
        metrics.sessions_total.load(Ordering::Relaxed),
        metrics.active_sessions.load(Ordering::Relaxed),
        room_count,
        metrics.frames_in_total.load(Ordering::Relaxed),
        metrics.frames_out_total.load(Ordering::Relaxed),
        metrics
            .frames_dropped_newest_only_total
            .load(Ordering::Relaxed),
        metrics.auth_failures_total.load(Ordering::Relaxed),
    )
}

fn log_event(event: &str, fields: &[(&str, String)]) {
    let mut line = format!("{{\"event\":\"{}\"", json_escape(event));
    for (key, value) in fields {
        line.push_str(&format!(
            ",\"{}\":\"{}\"",
            json_escape(key),
            json_escape(value)
        ));
    }
    line.push('}');
    println!("{line}");
}

fn json_escape(value: &str) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(ch),
        }
    }
    out
}

fn constant_time_equal(a: &str, b: &str) -> bool {
    let left = a.as_bytes();
    let right = b.as_bytes();
    let max = left.len().max(right.len()).max(1);
    let mut diff = (left.len() ^ right.len()) as u8;
    for i in 0..max {
        let l = *left.get(i).unwrap_or(&0);
        let r = *right.get(i).unwrap_or(&0);
        diff |= l ^ r;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::{anyhow, Context};
    use std::time::Duration;
    use tokio::task::JoinHandle;
    use tokio::time::{sleep, timeout};
    use wtransport::endpoint::endpoint_side::Client;
    use wtransport::tls::Sha256Digest;
    use wtransport::ClientConfig;

    struct TestRelay {
        port: u16,
        cert_digest: Sha256Digest,
        rooms: Rooms,
        task: JoinHandle<()>,
    }

    impl TestRelay {
        fn start(token: &str) -> anyhow::Result<Self> {
            let identity = Identity::self_signed(["localhost", "127.0.0.1", "::1"])?;
            let cert_digest = identity.certificate_chain().as_slice()[0].hash();
            let config = ServerConfig::builder()
                .with_bind_default(0)
                .with_identity(identity)
                .keep_alive_interval(Some(Duration::from_millis(100)))
                .build();
            let endpoint = Endpoint::server(config)?;
            let port = endpoint.local_addr()?.port();
            let rooms: Rooms = Arc::new(Mutex::new(HashMap::new()));
            let metrics: Metrics = Arc::new(RelayMetrics::default());
            let relay_token = Arc::new(token.to_string());

            let task = tokio::spawn({
                let rooms = rooms.clone();
                async move {
                    loop {
                        let incoming = endpoint.accept().await;
                        let rooms = rooms.clone();
                        let relay_token = relay_token.clone();
                        let metrics = metrics.clone();
                        tokio::spawn(async move {
                            let _ = handle_session(incoming, rooms, relay_token, metrics).await;
                        });
                    }
                }
            });

            Ok(Self {
                port,
                cert_digest,
                rooms,
                task,
            })
        }

        fn url(&self, path: &str) -> String {
            format!("https://127.0.0.1:{}{path}", self.port)
        }
    }

    impl Drop for TestRelay {
        fn drop(&mut self) {
            self.task.abort();
        }
    }

    fn client_endpoint(cert_digest: Sha256Digest) -> anyhow::Result<Endpoint<Client>> {
        let config = ClientConfig::builder()
            .with_bind_default()
            .with_server_certificate_hashes([cert_digest])
            .build();
        Ok(Endpoint::client(config)?)
    }

    async fn wait_for_participants(
        rooms: &Rooms,
        room: &str,
        expected: usize,
    ) -> anyhow::Result<()> {
        timeout(Duration::from_secs(2), async {
            loop {
                let actual = {
                    let map = rooms.lock().await;
                    map.get(room).map(|state| state.participants).unwrap_or(0)
                };
                if actual == expected {
                    return;
                }
                sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .map_err(|_| anyhow!("room {room} did not reach {expected} participants"))?;
        Ok(())
    }

    async fn wait_for_room_empty(rooms: &Rooms, room: &str) -> anyhow::Result<()> {
        timeout(Duration::from_secs(2), async {
            loop {
                if !rooms.lock().await.contains_key(room) {
                    return;
                }
                sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .map_err(|_| anyhow!("room {room} was not garbage-collected"))?;
        Ok(())
    }

    #[test]
    fn token_compare_handles_matches_mismatches_and_length_changes() {
        assert!(constant_time_equal("secret", "secret"));
        assert!(!constant_time_equal("secret", "wrong"));
        assert!(!constant_time_equal("secret", "secret-extra"));
        assert!(!constant_time_equal("", "secret"));
    }

    #[test]
    fn metrics_render_prometheus_counters() {
        let metrics = RelayMetrics::default();
        metrics.sessions_total.store(2, Ordering::Relaxed);
        metrics.active_sessions.store(1, Ordering::Relaxed);
        metrics.frames_in_total.store(30, Ordering::Relaxed);
        metrics.frames_out_total.store(29, Ordering::Relaxed);
        metrics
            .frames_dropped_newest_only_total
            .store(9, Ordering::Relaxed);
        metrics.auth_failures_total.store(1, Ordering::Relaxed);
        let body = render_metrics(&metrics, 3);
        assert!(body.contains("minamo_relay_sessions_total 2"));
        assert!(body.contains("minamo_relay_active_sessions 1"));
        assert!(body.contains("minamo_relay_rooms 3"));
        assert!(body.contains("minamo_relay_frames_dropped_newest_only_total 9"));
    }

    #[test]
    fn newest_only_drain_keeps_latest_frame() {
        let metrics = RelayMetrics::default();
        let (tx, mut rx) = broadcast::channel(16);
        for i in 0u8..10 {
            tx.send(vec![i]).unwrap();
        }
        let first = rx.blocking_recv().unwrap();
        let newest = drain_newest(&mut rx, first, &metrics);
        assert_eq!(newest, vec![9]);
        assert_eq!(
            metrics
                .frames_dropped_newest_only_total
                .load(Ordering::Relaxed),
            9
        );
    }

    #[tokio::test]
    async fn gc_room_removes_room_after_last_participant_leaves() {
        let rooms: Rooms = Arc::new(Mutex::new(HashMap::new()));
        {
            let mut map = rooms.lock().await;
            map.insert(
                "demo".to_string(),
                Room {
                    tx: broadcast::channel(ROOM_CAPACITY).0,
                    participants: 2,
                },
            );
        }

        gc_room(&rooms, "demo").await;
        assert_eq!(rooms.lock().await.get("demo").unwrap().participants, 1);

        gc_room(&rooms, "demo").await;
        assert!(!rooms.lock().await.contains_key("demo"));
    }

    #[tokio::test]
    async fn gc_room_ignores_missing_rooms() {
        let rooms: Rooms = Arc::new(Mutex::new(HashMap::new()));
        gc_room(&rooms, "missing").await;
        assert!(rooms.lock().await.is_empty());
    }

    #[tokio::test]
    async fn rejects_wrong_webtransport_room_token() -> anyhow::Result<()> {
        let relay = TestRelay::start("secret")?;
        let client = client_endpoint(relay.cert_digest.clone())?;

        let result = timeout(
            Duration::from_secs(2),
            client.connect(relay.url("/room/demo/wrong/pub")),
        )
        .await
        .context("wrong-token WebTransport connect timed out")?;

        assert!(result.is_err(), "wrong room token must reject the session");
        assert!(relay.rooms.lock().await.is_empty());
        Ok(())
    }

    #[tokio::test]
    async fn webtransport_pub_sub_echoes_datagram_through_room() -> anyhow::Result<()> {
        let relay = TestRelay::start("secret")?;
        let subscriber = client_endpoint(relay.cert_digest.clone())?;
        let publisher = client_endpoint(relay.cert_digest.clone())?;

        let sub_conn = timeout(
            Duration::from_secs(2),
            subscriber.connect(relay.url("/room/demo/secret/sub")),
        )
        .await
        .context("subscriber WebTransport connect timed out")??;
        wait_for_participants(&relay.rooms, "demo", 1).await?;

        let pub_conn = timeout(
            Duration::from_secs(2),
            publisher.connect(relay.url("/room/demo/secret/pub")),
        )
        .await
        .context("publisher WebTransport connect timed out")??;
        wait_for_participants(&relay.rooms, "demo", 2).await?;

        let payload = b"kgm1 datagram";
        for _ in 0..3 {
            pub_conn.send_datagram(payload)?;
        }

        let received = timeout(Duration::from_secs(2), async {
            loop {
                let frame = sub_conn.receive_datagram().await?;
                if frame.as_ref() == payload {
                    return Ok::<_, anyhow::Error>(frame);
                }
            }
        })
        .await
        .context("subscriber did not receive relayed datagram")??;
        assert_eq!(received.as_ref(), payload);

        pub_conn.close(0u32.into(), b"test done");
        sub_conn.close(0u32.into(), b"test done");
        drop(pub_conn);
        drop(sub_conn);
        wait_for_room_empty(&relay.rooms, "demo").await?;
        Ok(())
    }
}
