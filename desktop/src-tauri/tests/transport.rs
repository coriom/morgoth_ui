use morgoth_desktop::{
    read_private_token, CreateProjectRequest, DomainList, DomainView, ManagementClient,
    ManagementStatus, ProjectCreation, ProjectList, ProjectValidation, ProjectView,
};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::TcpListener,
    os::unix::fs::PermissionsExt,
    path::PathBuf,
    sync::mpsc,
    thread,
    time::Duration,
};

fn token_file() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("token");
    std::fs::write(&path, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
    (dir, path)
}
fn server(
    status: &str,
    body: &str,
    extra: &str,
) -> (u16, mpsc::Receiver<String>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = mpsc::channel();
    let status = status.to_owned();
    let body = body.to_owned();
    let extra = extra.to_owned();
    let task = thread::spawn(move || {
        let (mut conn, _) = listener.accept().unwrap();
        conn.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        let mut buf = [0u8; 16384];
        let mut request = Vec::new();
        loop {
            let n = conn.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            request.extend_from_slice(&buf[..n]);
            if let Some(end) = request.windows(4).position(|part| part == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&request[..end]).to_ascii_lowercase();
                let length = head
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length: "))
                    .and_then(|raw| raw.parse::<usize>().ok())
                    .unwrap_or(0);
                if request.len() >= end + 4 + length {
                    break;
                }
            }
        }
        let _ = tx.send(String::from_utf8_lossy(&request).to_string());
        let reply = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{extra}\r\n{body}", body.len());
        conn.write_all(reply.as_bytes()).unwrap();
    });
    (port, rx, task)
}

#[tokio::test]
async fn fixed_path_auth_and_no_origin() {
    let (_dir, token) = token_file();
    let (port, rx, task) = server(
        "200 OK",
        r#"{"api_version":"1","management_available":true}"#,
        "",
    );
    let client = ManagementClient::new(port, &token).unwrap();
    assert!(
        client
            .management_status()
            .await
            .unwrap()
            .management_available
    );
    let request = rx.recv().unwrap().to_ascii_lowercase();
    task.join().unwrap();
    assert!(request.starts_with("get /management/v1/status http/1.1"));
    assert!(request.contains("host: 127.0.0.1:"));
    assert!(request.contains("x-morgoth-management-token:"));
    assert!(!request.contains("origin:"));
}

#[tokio::test]
async fn auth_redirect_malformed_and_size_errors() {
    let (_dir, token) = token_file();
    let (port, _, task) = server(
        "401 Unauthorized",
        r#"{"error":{"code":"INVALID_TOKEN","message":"not authorized"}}"#,
        "",
    );
    let client = ManagementClient::new(port, &token).unwrap();
    let error = client.management_status().await.unwrap_err();
    task.join().unwrap();
    assert_eq!(error.status, Some(401));
    assert_eq!(error.code.as_deref(), Some("INVALID_TOKEN"));
    assert!(!serde_json::to_string(&error).unwrap().contains("AAAA"));
    let (port, _, task) = server("302 Found", "", "Location: http://example.invalid/\r\n");
    assert_eq!(
        ManagementClient::new(port, &token)
            .unwrap()
            .management_status()
            .await
            .unwrap_err()
            .kind,
        "REDIRECT_REJECTED"
    );
    task.join().unwrap();
    let (port, _, task) = server("200 OK", "not json", "");
    assert_eq!(
        ManagementClient::new(port, &token)
            .unwrap()
            .management_status()
            .await
            .unwrap_err()
            .kind,
        "INCOMPATIBLE_RESPONSE"
    );
    task.join().unwrap();
    let (port, _, task) = server("200 OK", &"x".repeat(65_537), "");
    assert_eq!(
        ManagementClient::new(port, &token)
            .unwrap()
            .management_status()
            .await
            .unwrap_err()
            .kind,
        "OVERSIZED_RESPONSE"
    );
    task.join().unwrap();
}

#[tokio::test]
async fn conflict_and_durability_warning_are_preserved() {
    let (_dir, token) = token_file();
    let input = CreateProjectRequest {
        id: "research_a".into(),
        name: "Research A".into(),
        domain: "crypto".into(),
    };
    let (port, rx, task) = server(
        "409 Conflict",
        r#"{"error":{"code":"ALREADY_EXISTS","message":"exists"}}"#,
        "",
    );
    let err = ManagementClient::new(port, &token)
        .unwrap()
        .create_project(&input)
        .await
        .unwrap_err();
    task.join().unwrap();
    assert_eq!(err.code.as_deref(), Some("ALREADY_EXISTS"));
    assert!(rx
        .recv()
        .unwrap()
        .starts_with("POST /management/v1/projects HTTP/1.1"));
    let project = json!({"id":"research_a","name":"Research A","domain":"crypto","legacy":false,
        "manifest_path":"/tmp/a/project.yaml","workspace_root":"/tmp/a/workspace","postgres_schema":"a",
        "chroma_prefix":"a","vault_dir":"/tmp/a/vault","runtime_dir":"/tmp/a/runtime",
        "configuration_valid":true,"runtime_checked":false});
    let body = json!({"project":project,"created":true,"durability_confirmed":false,
        "engine_started":false,"storage_initialized":false})
    .to_string();
    let (port, _, task) = server("201 Created", &body, "");
    let result: ProjectCreation = ManagementClient::new(port, &token)
        .unwrap()
        .create_project(&input)
        .await
        .unwrap();
    task.join().unwrap();
    assert!(!result.durability_confirmed && result.created);
}

#[test]
fn token_permissions_symlinks_and_content_are_rejected() {
    let (_dir, path) = token_file();
    assert!(read_private_token(&path).is_ok());
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert!(read_private_token(&path).is_err());
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
    let link = path.with_extension("link");
    std::os::unix::fs::symlink(&path, &link).unwrap();
    assert!(read_private_token(&link).is_err());
    let parent_link = path.parent().unwrap().join("parent-link");
    std::os::unix::fs::symlink(path.parent().unwrap(), &parent_link).unwrap();
    assert!(read_private_token(&parent_link.join("token")).is_err());
    std::fs::write(&path, "short").unwrap();
    assert!(read_private_token(&path).is_err());
}

#[tokio::test]
async fn post_timeout_is_uncertain_and_never_retried() {
    let (_dir, token) = token_file();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let task = thread::spawn(move || {
        let (mut conn, _) = listener.accept().unwrap();
        conn.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let mut buf = [0u8; 4096];
        let _ = conn.read(&mut buf);
        thread::sleep(Duration::from_secs(9));
        listener.set_nonblocking(true).unwrap();
        assert!(listener.accept().is_err(), "POST was retried");
    });
    let input = CreateProjectRequest {
        id: "a".into(),
        name: "A".into(),
        domain: "crypto".into(),
    };
    let error = ManagementClient::new(port, &token)
        .unwrap()
        .create_project(&input)
        .await
        .unwrap_err();
    assert_eq!(error.kind, "UNCERTAIN_CREATE");
    task.join().unwrap();
}

#[test]
fn rust_types_and_routes_match_pinned_contract() {
    let spec: Value = serde_json::from_str(include_str!(
        "../../contracts/management_api_v1.openapi.json"
    ))
    .unwrap();
    let schemas = &spec["components"]["schemas"];
    let input = serde_json::to_value(CreateProjectRequest {
        id: "a".into(),
        name: "A".into(),
        domain: "crypto".into(),
    })
    .unwrap();
    let status = serde_json::to_value(ManagementStatus {
        api_version: "1".into(),
        management_available: true,
    })
    .unwrap();
    let domain = DomainView {
        id: "crypto".into(),
        tagline: None,
        configuration_valid: true,
        diagnostic: None,
    };
    let project = ProjectView {
        id: "a".into(),
        name: "A".into(),
        domain: "crypto".into(),
        legacy: false,
        manifest_path: None,
        workspace_root: None,
        postgres_schema: "a".into(),
        chroma_prefix: "a".into(),
        vault_dir: "v".into(),
        runtime_dir: "r".into(),
        configuration_valid: true,
        runtime_checked: false,
    };
    let samples = [
        ("CreateProjectRequest", input),
        ("ManagementStatus", status),
        ("DomainView", serde_json::to_value(&domain).unwrap()),
        (
            "DomainList",
            serde_json::to_value(DomainList {
                domains: vec![domain],
                runtime_checked: false,
            })
            .unwrap(),
        ),
        ("ProjectView", serde_json::to_value(&project).unwrap()),
        (
            "ProjectList",
            serde_json::to_value(ProjectList {
                projects: vec![project.clone()],
                configuration_valid: true,
                runtime_checked: false,
            })
            .unwrap(),
        ),
        (
            "ProjectValidation",
            serde_json::to_value(ProjectValidation {
                project: project.clone(),
                configuration_valid: true,
                runtime_checked: false,
            })
            .unwrap(),
        ),
        (
            "ProjectCreation",
            serde_json::to_value(ProjectCreation {
                project,
                created: true,
                durability_confirmed: false,
                engine_started: false,
                storage_initialized: false,
            })
            .unwrap(),
        ),
    ];
    for (name, sample) in samples {
        let fields = sample
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        let expected = schemas[name]["properties"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        assert_eq!(fields, expected, "{name} field mismatch");
    }
    for (path, method, operation) in [
        ("/management/v1/status", "get", "management_status_v1"),
        (
            "/management/v1/domains",
            "get",
            "management_list_domains_v1",
        ),
        (
            "/management/v1/projects",
            "get",
            "management_list_projects_v1",
        ),
        (
            "/management/v1/projects",
            "post",
            "management_create_project_v1",
        ),
        (
            "/management/v1/projects/{project_id}",
            "get",
            "management_get_project_v1",
        ),
        (
            "/management/v1/projects/{project_id}/validation",
            "get",
            "management_validate_project_v1",
        ),
    ] {
        assert_eq!(spec["paths"][path][method]["operationId"], operation);
    }
    assert_eq!(
        spec["components"]["securitySchemes"]["ManagementToken"]["name"],
        "X-Morgoth-Management-Token"
    );
}

#[test]
fn required_nullable_contract_fields_cannot_be_omitted() {
    let incomplete_domain = json!({"id":"crypto","configuration_valid":true});
    assert!(serde_json::from_value::<DomainView>(incomplete_domain).is_err());
    let incomplete_project = json!({"id":"a","name":"A","domain":"crypto","legacy":false,
        "postgres_schema":"a","chroma_prefix":"a","vault_dir":"v","runtime_dir":"r",
        "configuration_valid":true,"runtime_checked":false});
    assert!(serde_json::from_value::<ProjectView>(incomplete_project).is_err());
}
