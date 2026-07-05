// KAGAMI relay (Rust, WebTransport).
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

type Rooms = Arc<Mutex<HashMap<String, broadcast::Sender<Vec<u8>>>>>;

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

    println!("KAGAMI relay-rs (WebTransport)");
    println!("  url  : https://localhost:{PORT}/room/<room>/<pub|sub>");
    println!("  cert sha-256 (paste into the tracker/viewer UI):");
    println!("    {}", digest.fmt(Sha256DigestFmt::DottedHex));
    println!("  note : self-signed; restart regenerates it (14-day browser limit)");

    loop {
        let incoming = endpoint.accept().await;
        let rooms = rooms.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_session(incoming, rooms).await {
                eprintln!("[session] {e}");
            }
        });
    }
}

async fn handle_session(incoming: IncomingSession, rooms: Rooms) -> anyhow::Result<()> {
    let request = incoming.await?;
    let path = request.path().to_string();

    // expected path: /room/<room>/<pub|sub>
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    if parts.len() != 3 || parts[0] != "room" {
        request.not_found().await;
        return Ok(());
    }
    let room = parts[1].to_string();
    let role = parts[2].to_string();

    let connection = request.accept().await?;
    println!("[join] room={room} role={role}");

    let tx = {
        let mut map = rooms.lock().await;
        map.entry(room.clone())
            .or_insert_with(|| broadcast::channel(ROOM_CAPACITY).0)
            .clone()
    };

    match role.as_str() {
        "pub" => {
            // Publisher: every received datagram fans out to the room.
            loop {
                match connection.receive_datagram().await {
                    Ok(dgram) => {
                        let _ = tx.send(dgram.to_vec());
                    }
                    Err(_) => break, // connection closed
                }
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
    Ok(())
}
