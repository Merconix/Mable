#![cfg(test)]

use std::collections::BTreeMap;
use std::sync::Arc;

use matrix_sdk::ruma::api::client::keys::upload_keys;
use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::{OneTimeKeyAlgorithm, OwnedUserId, UInt, UserId};
use matrix_sdk_crypto::types::requests::{AnyIncomingResponse, AnyOutgoingRequest};
use matrix_sdk_crypto::OlmMachine;
use matrix_sdk_sqlite::SqliteCryptoStore;
use serde_json::{json, Value};

use super::dispatch;

const ROOM: &str = "!room:example.org";

struct Peer {
    machine: OlmMachine,
    user: OwnedUserId,
}

async fn peer(user: &str, device: &str, tag: &str) -> Peer {
    let dir = std::env::temp_dir().join(format!("sable-flow-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let user: OwnedUserId = UserId::parse(user).unwrap();
    let store = SqliteCryptoStore::open(dir.join("crypto.sqlite3"), Some("pw"))
        .await
        .unwrap();
    let machine = OlmMachine::with_store(&user, device.into(), Arc::new(store), None)
        .await
        .unwrap();

    Peer { machine, user }
}

async fn call(peer: &Peer, method: &str, args: Value) -> Value {
    dispatch::invoke(&peer.machine, method, args)
        .await
        .unwrap_or_else(|e| panic!("{method}: {e}"))
}

async fn publish_keys(peer: &Peer) -> (Raw<matrix_sdk::ruma::encryption::DeviceKeys>, Value) {
    let mut device_keys = None;
    let mut one_time_keys = Value::Null;

    for request in peer.machine.outgoing_requests().await.unwrap() {
        let AnyOutgoingRequest::KeysUpload(upload) = request.request() else {
            continue;
        };
        if let Some(keys) = upload.device_keys.clone() {
            device_keys = Some(keys);
        }
        one_time_keys = json!(upload.one_time_keys);

        let mut counts = BTreeMap::new();
        counts.insert(
            OneTimeKeyAlgorithm::SignedCurve25519,
            UInt::new(upload.one_time_keys.len() as u64).unwrap(),
        );
        let response = upload_keys::v3::Response::new(counts);
        peer.machine
            .mark_request_as_sent(
                request.request_id(),
                AnyIncomingResponse::KeysUpload(&response),
            )
            .await
            .unwrap();
    }

    (
        device_keys.expect("peer issued no device keys"),
        one_time_keys,
    )
}

async fn learn_about(
    learner: &Peer,
    about: &Peer,
    device: &str,
    keys: &Raw<matrix_sdk::ruma::encryption::DeviceKeys>,
) {
    call(
        learner,
        "updateTrackedUsers",
        json!({ "users": [about.user.to_string()] }),
    )
    .await;

    let request = call(
        learner,
        "queryKeysForUsers",
        json!({ "users": [about.user.to_string()] }),
    )
    .await;

    let response = json!({
        "device_keys": { about.user.to_string(): { device: keys } },
    });
    call(
        learner,
        "markRequestAsSent",
        json!({
            "requestId": request["id"],
            "requestType": request["type"],
            "response": response.to_string(),
        }),
    )
    .await;
}

async fn claim_session(claimer: &Peer, peer_user: &str, peer_device: &str, one_time_keys: &Value) {
    let request = call(
        claimer,
        "getMissingSessions",
        json!({ "users": [peer_user] }),
    )
    .await;
    assert!(!request.is_null(), "expected a keys-claim request");

    let response = json!({
        "one_time_keys": { peer_user: { peer_device: one_time_keys } },
    });
    call(
        claimer,
        "markRequestAsSent",
        json!({
            "requestId": request["id"],
            "requestType": request["type"],
            "response": response.to_string(),
        }),
    )
    .await;
}

fn to_device_events(sender: &UserId, request: &Value) -> Value {
    let body: Value = serde_json::from_str(request["body"].as_str().unwrap()).unwrap();
    let event_type = request["event_type"].as_str().unwrap();

    let mut events = Vec::new();
    for devices in body["messages"].as_object().into_iter().flatten() {
        for content in devices.1.as_object().into_iter().flatten() {
            events.push(json!({
                "sender": sender.to_string(),
                "type": event_type,
                "content": content.1,
            }));
        }
    }
    Value::Array(events)
}

async fn drain_to(from: &Peer, to: &Peer) {
    let requests = call(from, "outgoingRequests", json!({})).await;

    for request in requests.as_array().unwrap() {
        if request["className"] != "ToDeviceRequest" {
            continue;
        }
        let events = to_device_events(&from.user, request);
        call(
            to,
            "receiveSyncChanges",
            json!({ "toDeviceEvents": events.to_string() }),
        )
        .await;
        call(
            from,
            "markRequestAsSent",
            json!({
                "requestId": request["id"],
                "requestType": request["type"],
                "response": "{}",
            }),
        )
        .await;
    }
}

fn encryption_settings() -> Value {
    json!({
        "algorithm": "m.megolm.v1.aes-sha2",
        "historyVisibility": "shared",
        "sharingStrategy": "allDevices",
    })
}

async fn encrypt_message(peer: &Peer, body: &str) -> Value {
    let encrypted = call(
        peer,
        "encryptRoomEvent",
        json!({
            "roomId": ROOM,
            "eventType": "m.room.message",
            "content": json!({ "msgtype": "m.text", "body": body }).to_string(),
        }),
    )
    .await;

    serde_json::from_str(encrypted.as_str().unwrap()).unwrap()
}

fn encrypted_event(content: Value, event_id: &str) -> Value {
    json!({
        "event_id": event_id,
        "type": "m.room.encrypted",
        "sender": "@alice:example.org",
        "room_id": ROOM,
        "origin_server_ts": 0,
        "content": content,
    })
}

async fn decrypt_message(peer: &Peer, event: Value) -> Value {
    dispatch::invoke(
        &peer.machine,
        "decryptRoomEvent",
        json!({
            "event": event.to_string(),
            "roomId": ROOM,
            "decryptionSettings": { "senderDeviceTrustRequirement": 0 },
        }),
    )
    .await
    .unwrap()
}

async fn deliver_shared_room_keys(alice: &Peer, bob: &Peer, shared: &Value) {
    for request in shared.as_array().unwrap() {
        let events = to_device_events(&alice.user, request);
        call(
            bob,
            "receiveSyncChanges",
            json!({ "toDeviceEvents": events.to_string() }),
        )
        .await;
        call(
            alice,
            "markRequestAsSent",
            json!({
                "requestId": request["id"],
                "requestType": request["type"],
                "response": "{}",
            }),
        )
        .await;
    }
    drain_to(alice, bob).await;
}

#[tokio::test]
async fn the_encrypt_event_sequence_produces_a_readable_message() {
    let alice = peer("@alice:example.org", "ALICEDEV", "alice").await;
    let bob = peer("@bob:example.org", "BOBDEV", "bob").await;

    let (alice_keys, _) = publish_keys(&alice).await;
    let (bob_keys, bob_otks) = publish_keys(&bob).await;

    learn_about(&alice, &bob, "BOBDEV", &bob_keys).await;
    learn_about(&bob, &alice, "ALICEDEV", &alice_keys).await;

    claim_session(&alice, "@bob:example.org", "BOBDEV", &bob_otks).await;
    drain_to(&alice, &bob).await;

    let shared = call(
        &alice,
        "shareRoomKey",
        json!({
            "roomId": ROOM,
            "users": ["@bob:example.org"],
            "encryptionSettings": encryption_settings(),
        }),
    )
    .await;

    for request in shared.as_array().unwrap() {
        let events = to_device_events(&alice.user, request);
        call(
            &bob,
            "receiveSyncChanges",
            json!({ "toDeviceEvents": events.to_string() }),
        )
        .await;
        call(
            &alice,
            "markRequestAsSent",
            json!({
                "requestId": request["id"],
                "requestType": request["type"],
                "response": "{}",
            }),
        )
        .await;
    }
    drain_to(&alice, &bob).await;

    let encrypted = call(
        &alice,
        "encryptRoomEvent",
        json!({
            "roomId": ROOM,
            "eventType": "m.room.message",
            "content": json!({ "msgtype": "m.text", "body": "hello over the engine" }).to_string(),
        }),
    )
    .await;

    let content: Value = serde_json::from_str(encrypted.as_str().unwrap()).unwrap();
    let event = json!({
        "event_id": "$1:example.org",
        "type": "m.room.encrypted",
        "sender": "@alice:example.org",
        "room_id": ROOM,
        "origin_server_ts": 0,
        "content": content,
    });

    let decrypted = call(
        &bob,
        "decryptRoomEvent",
        json!({
            "event": event.to_string(),
            "roomId": ROOM,
            "decryptionSettings": { "senderDeviceTrustRequirement": 0 },
        }),
    )
    .await;

    let clear: Value = serde_json::from_str(decrypted["event"].as_str().unwrap()).unwrap();
    assert_eq!(clear["content"]["body"], "hello over the engine");
    assert_eq!(decrypted["sender"], "@alice:example.org");
    assert_eq!(decrypted["senderDevice"], "ALICEDEV");
}

#[tokio::test]
async fn share_room_key_requests_never_reach_the_outgoing_pump() {
    let alice = peer("@alice:example.org", "ALICEDEV", "pump-alice").await;
    let bob = peer("@bob:example.org", "BOBDEV", "pump-bob").await;

    let (alice_keys, _) = publish_keys(&alice).await;
    let (bob_keys, bob_otks) = publish_keys(&bob).await;
    learn_about(&alice, &bob, "BOBDEV", &bob_keys).await;
    learn_about(&bob, &alice, "ALICEDEV", &alice_keys).await;

    claim_session(&alice, "@bob:example.org", "BOBDEV", &bob_otks).await;
    drain_to(&alice, &bob).await;

    let shared = call(
        &alice,
        "shareRoomKey",
        json!({
            "roomId": ROOM,
            "users": ["@bob:example.org"],
            "encryptionSettings": encryption_settings(),
        }),
    )
    .await;
    assert!(
        !shared.as_array().unwrap().is_empty(),
        "sharing a room key must produce to-device messages"
    );

    let queued = call(&alice, "outgoingRequests", json!({})).await;
    let to_device = queued
        .as_array()
        .unwrap()
        .iter()
        .filter(|request| request["className"] == "ToDeviceRequest")
        .count();
    assert_eq!(
        to_device, 0,
        "the pump does not carry them; the caller must send what shareRoomKey returned"
    );
}

#[tokio::test]
async fn share_room_key_accepts_the_settings_the_webview_builds() {
    let alice = peer("@alice:example.org", "ALICEDEV", "settings").await;

    let result = dispatch::invoke(
        &alice.machine,
        "shareRoomKey",
        json!({
            "roomId": ROOM,
            "users": [],
            "encryptionSettings": encryption_settings(),
        }),
    )
    .await;

    assert!(result.is_ok(), "{:?}", result.unwrap_err());
}

#[tokio::test]
async fn resharing_after_invalidation_rotates_the_key() {
    let alice = peer("@alice:example.org", "ALICEDEV", "invalidate-alice").await;
    let bob = peer("@bob:example.org", "BOBDEV", "invalidate-bob").await;

    let (alice_keys, _) = publish_keys(&alice).await;
    let (bob_keys, bob_otks) = publish_keys(&bob).await;
    learn_about(&alice, &bob, "BOBDEV", &bob_keys).await;
    learn_about(&bob, &alice, "ALICEDEV", &alice_keys).await;
    claim_session(&alice, "@bob:example.org", "BOBDEV", &bob_otks).await;
    drain_to(&alice, &bob).await;

    let shared = call(
        &alice,
        "shareRoomKey",
        json!({
            "roomId": ROOM,
            "users": ["@bob:example.org"],
            "encryptionSettings": encryption_settings(),
        }),
    )
    .await;
    deliver_shared_room_keys(&alice, &bob, &shared).await;

    let before = encrypt_message(&alice, "before invalidation").await;
    let decrypted = decrypt_message(
        &bob,
        encrypted_event(before.clone(), "$before-invalidation:example.org"),
    )
    .await;
    let clear: Value = serde_json::from_str(decrypted["event"].as_str().unwrap()).unwrap();
    assert_eq!(clear["content"]["body"], "before invalidation");
    assert_eq!(
        call(&alice, "invalidateGroupSession", json!({ "roomId": ROOM }),).await,
        Value::Bool(true)
    );

    let reshared = call(
        &alice,
        "shareRoomKey",
        json!({
            "roomId": ROOM,
            "users": [],
            "encryptionSettings": encryption_settings(),
        }),
    )
    .await;
    assert!(reshared.as_array().unwrap().is_empty());

    let after = encrypt_message(&alice, "after invalidation").await;
    let result = decrypt_message(
        &bob,
        encrypted_event(after.clone(), "$after-invalidation:example.org"),
    )
    .await;
    assert_ne!(
        before["session_id"], after["session_id"],
        "Bob result after invalidation: {result:?}"
    );
    assert_eq!(result["className"], "DecryptionError");
    assert_eq!(
        result["code"], 0,
        "unexpected decryption failure: {result:?}"
    );
}

#[tokio::test]
async fn removing_a_recipient_rotates_before_the_next_event() {
    let alice = peer("@alice:example.org", "ALICEDEV", "remove-alice").await;
    let bob = peer("@bob:example.org", "BOBDEV", "remove-bob").await;

    let (alice_keys, _) = publish_keys(&alice).await;
    let (bob_keys, bob_otks) = publish_keys(&bob).await;
    learn_about(&alice, &bob, "BOBDEV", &bob_keys).await;
    learn_about(&bob, &alice, "ALICEDEV", &alice_keys).await;
    claim_session(&alice, "@bob:example.org", "BOBDEV", &bob_otks).await;
    drain_to(&alice, &bob).await;

    let shared = call(
        &alice,
        "shareRoomKey",
        json!({
            "roomId": ROOM,
            "users": ["@bob:example.org"],
            "encryptionSettings": encryption_settings(),
        }),
    )
    .await;
    deliver_shared_room_keys(&alice, &bob, &shared).await;
    let before = encrypt_message(&alice, "before removal").await;
    let decrypted = decrypt_message(
        &bob,
        encrypted_event(before.clone(), "$before-removal:example.org"),
    )
    .await;
    let clear: Value = serde_json::from_str(decrypted["event"].as_str().unwrap()).unwrap();
    assert_eq!(clear["content"]["body"], "before removal");

    let unchanged = call(
        &alice,
        "shareRoomKey",
        json!({
            "roomId": ROOM,
            "users": ["@bob:example.org"],
            "encryptionSettings": encryption_settings(),
        }),
    )
    .await;
    assert!(unchanged.as_array().unwrap().is_empty());

    let removed = call(
        &alice,
        "shareRoomKey",
        json!({
            "roomId": ROOM,
            "users": [],
            "encryptionSettings": encryption_settings(),
        }),
    )
    .await;
    assert!(removed.as_array().unwrap().is_empty());

    let after = encrypt_message(&alice, "after removal").await;
    let result = decrypt_message(
        &bob,
        encrypted_event(after.clone(), "$after-removal:example.org"),
    )
    .await;
    assert_ne!(
        before["session_id"], after["session_id"],
        "Bob result after removal: {result:?}"
    );
    assert_eq!(result["className"], "DecryptionError");
    assert_eq!(
        result["code"], 0,
        "unexpected decryption failure: {result:?}"
    );
}
