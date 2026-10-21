use morgoth_desktop::ollama_read::OllamaReader;
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
    time::Duration,
};

fn serve(
    responses: Vec<(&'static str, String, &'static str)>,
) -> (u16, thread::JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let task = thread::spawn(move || {
        let mut requests = Vec::new();
        for (status, body, extra) in responses {
            let (mut conn, _) = listener.accept().unwrap();
            conn.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let mut bytes = Vec::new();
            let mut buf = [0; 2048];
            while !bytes.ends_with(b"\r\n\r\n") {
                let n = conn.read(&mut buf).unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&buf[..n]);
                if bytes.len() > 4096 {
                    panic!("unbounded request");
                }
            }
            requests.push(String::from_utf8(bytes).unwrap());
            let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n{body}", body.len());
            conn.write_all(response.as_bytes()).unwrap();
        }
        requests
    });
    (port, task)
}

#[tokio::test]
async fn exactly_two_fixed_gets_return_only_allowlisted_model_fields() {
    let tags = r#"{"models":[{"name":"z:1","model":"z:1","size":42,"digest":"private-digest","details":{"family":"private"}},{"name":"a:1","model":"a:1","size":12}]}"#;
    let ps = r#"{"models":[{"name":"z:1","model":"z:1","size":42,"size_vram":17}]}"#;
    let (port, task) = serve(vec![("200 OK", tags.into(), ""), ("200 OK", ps.into(), "")]);
    let status = OllamaReader::new(port, Some("a:1".into()))
        .unwrap()
        .read()
        .await;
    let requests = task.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests[0].starts_with("GET /api/tags HTTP/1.1"));
    assert!(requests[1].starts_with("GET /api/ps HTTP/1.1"));
    for request in requests {
        let lower = request.to_ascii_lowercase();
        assert!(!lower.contains("cookie:"));
        assert!(!lower.contains("authorization:"));
        assert!(!lower.contains("origin:"));
        assert!(!lower.contains("/api/chat"));
        assert!(!lower.contains("/api/generate"));
    }
    assert_eq!(status.service_state, "REACHABLE");
    assert_eq!(status.installed_state, "OBSERVED");
    assert_eq!(status.loaded_state, "OBSERVED");
    assert_eq!(status.installed[0].id, "a:1");
    assert_eq!(status.loaded[0].ollama_reported_vram_bytes, Some(17));
    assert_eq!(status.configured_model.as_deref(), Some("a:1"));
    let json = serde_json::to_string(&status).unwrap();
    assert!(!json.contains("private"));
    assert!(!json.contains("digest"));
}

#[tokio::test]
async fn empty_loaded_list_is_observed_not_service_failure() {
    let (port, task) = serve(vec![
        ("200 OK", r#"{"models":[]}"#.into(), ""),
        ("200 OK", r#"{"models":[]}"#.into(), ""),
    ]);
    let status = OllamaReader::new(port, Some("missing:1".into()))
        .unwrap()
        .read()
        .await;
    task.join().unwrap();
    assert_eq!(status.loaded_state, "OBSERVED");
    assert!(status.loaded.is_empty());
    assert_eq!(status.failure_class, None);
    assert_eq!(status.configured_model, None);
}

#[tokio::test]
async fn malformed_residency_is_partial_and_does_not_claim_unloaded() {
    let (port, task) = serve(vec![
        ("200 OK", r#"{"models":[]}"#.into(), ""),
        ("200 OK", r#"{"models":"private"}"#.into(), ""),
    ]);
    let status = OllamaReader::new(port, None).unwrap().read().await;
    task.join().unwrap();
    assert_eq!(status.service_state, "REACHABLE");
    assert_eq!(status.installed_state, "OBSERVED");
    assert_eq!(status.loaded_state, "UNAVAILABLE");
    assert_eq!(
        status.failure_class.as_deref(),
        Some("INCOMPATIBLE_RESPONSE")
    );
}

#[tokio::test]
async fn redirect_and_oversize_fail_without_following_or_retrying() {
    let (port, task) = serve(vec![(
        "302 Found",
        "".into(),
        "Location: http://example.invalid/api/ps\r\n",
    )]);
    let status = OllamaReader::new(port, None).unwrap().read().await;
    assert_eq!(task.join().unwrap().len(), 1);
    assert_eq!(status.failure_class.as_deref(), Some("REDIRECT_REJECTED"));
    assert_eq!(status.service_state, "UNAVAILABLE");
    let (port, task) = serve(vec![("200 OK", "x".repeat(32_769), "")]);
    let status = OllamaReader::new(port, None).unwrap().read().await;
    assert_eq!(task.join().unwrap().len(), 1);
    assert_eq!(status.failure_class.as_deref(), Some("OVERSIZED_RESPONSE"));
}

#[tokio::test]
async fn unavailable_and_http_error_are_fixed_non_disclosing_states() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let status = OllamaReader::new(port, None).unwrap().read().await;
    assert_eq!(status.service_state, "UNAVAILABLE");
    assert_eq!(status.failure_class.as_deref(), Some("CONNECT"));
    let (port, task) = serve(vec![(
        "500 Internal Server Error",
        "private body".into(),
        "",
    )]);
    let status = OllamaReader::new(port, None).unwrap().read().await;
    task.join().unwrap();
    assert_eq!(status.failure_class.as_deref(), Some("HTTP_STATUS"));
    assert!(!serde_json::to_string(&status).unwrap().contains("private"));
}
