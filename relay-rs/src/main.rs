// Minamo relay (Rust, WebTransport).
// The low-latency path: KGM1 frames travel as QUIC datagrams.
// Datagrams are unreliable and unordered by design. A late pose frame is a
// useless pose frame, so we never retransmit; the next frame replaces it.
//
// Rooms: the URL path selects a room and a role.
//   https://host:4433/room/<room>/pub   -> publisher (tracker)
//   https://host:4433/room/<room>/sub   -> subscriber (viewer)
//
// TLS: on startup the server generates a self-signed certificate valid for
// browsers via `serverCertificateHashes` and prints its SHA-256 hash.
// Paste that hash into the "cert sha-256" field in the tracker / viewer UI.
// Regenerate by restarting; browsers only accept such certs for <= 14 days.
//
// Run: cargo run --release

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use wtransport::endpoint::IncomingSession;
use wtransport::tls::Sha256DigestFmt;
use wtransport::{Endpoint, Identity, ServerConfig};

const PORT: u16 = 4433;
const ROOM_CAPACITY: usize = 512; // frames buffered per room before lagging subs drop

struct Room {
    tx: broadcast::Sender<Vec<u8>>,
    participants: usize,
}

type Rooms = Arc<Mutex<HashMap<String, Room>>>;

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
    let relay_token = Arc::new(
        std::env::var("MINAMO_RELAY_TOKEN")
            .or_else(|_| std::env::var("ROOM_TOKEN"))
            .unwrap_or_default(),
    );

    println!("Minamo relay-rs (WebTransport)");
    println!("  url  : https://localhost:{PORT}/room/<room>/<pub|sub>");
    println!("  cert sha-256 (paste into the tracker/viewer UI):");
    println!("    {}", digest.fmt(Sha256DigestFmt::DottedHex));
    println!("  note : self-signed; restart regenerates it (14-day browser limit)");

    loop {
        tokio::select! {
            incoming = endpoint.accept() => {
                let rooms = rooms.clone();
                let relay_token = relay_token.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_session(incoming, rooms, relay_token).await {
                        eprintln!("[session] {e}");
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
        request.not_found().await;
        return Ok(());
    }
    if role != "pub" && role != "sub" {
        request.not_found().await;
        return Ok(());
    }

    let connection = request.accept().await?;
    println!("[join] room={room} role={role}");

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
                            if connection.send_datagram(&frame).is_err() {
                                break;
                            }
                        }
                        // Slow subscriber: skip the missed frames and continue.
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    },
                    // Detect the peer going away even while the room is idle.
                    _ = connection.receive_datagram() => {}
                }
            }
        }
        _ => {
            // Unknown role; drop the session.
        }
    }

    println!("[leave] room={room} role={role}");
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

    #[test]
    fn token_compare_handles_matches_mismatches_and_length_changes() {
        assert!(constant_time_equal("secret", "secret"));
        assert!(!constant_time_equal("secret", "wrong"));
        assert!(!constant_time_equal("secret", "secret-extra"));
        assert!(!constant_time_equal("", "secret"));
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
}
