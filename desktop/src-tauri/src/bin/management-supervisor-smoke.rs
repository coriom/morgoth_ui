use morgoth_desktop::{
    supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig},
    CreateProjectRequest,
};
use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};

fn main() {
    let home = tempfile::Builder::new()
        .prefix("morgoth-supervisor-smoke-")
        .tempdir()
        .expect("disposable home");
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(home.path(), std::fs::Permissions::from_mode(0o700))
        .expect("private disposable home");
    let config = SupervisorConfig {
        backend_root: PathBuf::from(
            std::env::var_os("MORGOTH_DESKTOP_BACKEND_ROOT").expect("backend root"),
        ),
        python: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_PYTHON").expect("python")),
        home: home.path().to_path_buf(),
    };
    let supervisor = ManagementSupervisor::start(Ok(config));
    let deadline = Instant::now() + Duration::from_secs(22);
    while supervisor.status().state == ManagementPhase::Starting && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    let status = supervisor.status();
    assert_eq!(
        status.state,
        ManagementPhase::Ready,
        "startup: {:?}",
        status.diagnostic
    );
    let pid = supervisor.child_pid().expect("owned child");
    let other_home = tempfile::Builder::new()
        .prefix("morgoth-other-instance-")
        .tempdir()
        .expect("other disposable home");
    std::fs::set_permissions(other_home.path(), std::fs::Permissions::from_mode(0o700))
        .expect("other private home");
    let other = ManagementSupervisor::start(Ok(SupervisorConfig {
        backend_root: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_BACKEND_ROOT").unwrap()),
        python: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_PYTHON").unwrap()),
        home: other_home.path().to_path_buf(),
    }));
    let other_deadline = Instant::now() + Duration::from_secs(22);
    while other.status().state == ManagementPhase::Starting && Instant::now() < other_deadline {
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(other.status().state, ManagementPhase::Ready);
    let other_pid = other.child_pid().expect("other owned child");
    assert_ne!(pid, other_pid);
    let client = supervisor.client().expect("ready client");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime");
    runtime.block_on(async {
        let status = client
            .management_status()
            .await
            .expect("authenticated status");
        assert_eq!(status.api_version, "1");
        let domains = client.list_domains().await.expect("domains");
        assert!(domains.domains.iter().any(|domain| domain.id == "crypto"));
        for id in ["research_a", "research_b"] {
            let created = client
                .create_project(&CreateProjectRequest {
                    id: id.into(),
                    name: id.into(),
                    domain: "crypto".into(),
                })
                .await
                .expect("create");
            assert!(created.created && !created.engine_started && !created.storage_initialized);
            assert!(
                client
                    .validate_project(id)
                    .await
                    .expect("validate")
                    .configuration_valid
            );
        }
        let projects = client.list_projects().await.expect("list");
        let a = projects
            .projects
            .iter()
            .find(|project| project.id == "research_a")
            .expect("a");
        let b = projects
            .projects
            .iter()
            .find(|project| project.id == "research_b")
            .expect("b");
        assert_ne!(a.postgres_schema, b.postgres_schema);
        assert_ne!(a.vault_dir, b.vault_dir);
        let other_projects = other.client().unwrap().list_projects().await.unwrap();
        assert!(!other_projects
            .projects
            .iter()
            .any(|project| project.id == "research_a"));
    });
    supervisor.stop();
    other.stop();
    assert_eq!(supervisor.status().state, ManagementPhase::Stopped);
    assert_eq!(other.status().state, ManagementPhase::Stopped);
    assert!(
        !PathBuf::from(format!("/proc/{pid}")).exists(),
        "owned child still present"
    );
    assert!(!PathBuf::from(format!("/proc/{other_pid}")).exists());

    // A child that stays alive without binding must fail at the bounded deadline.
    let sleeping_python = home.path().join("sleeping-python");
    std::fs::write(
        &sleeping_python,
        b"#!/usr/bin/python3\nimport time\ntime.sleep(60)\n",
    )
    .unwrap();
    std::fs::set_permissions(&sleeping_python, std::fs::Permissions::from_mode(0o700)).unwrap();
    let stalled = ManagementSupervisor::start(Ok(SupervisorConfig {
        backend_root: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_BACKEND_ROOT").unwrap()),
        python: sleeping_python,
        home: home.path().to_path_buf(),
    }));
    let deadline = Instant::now() + Duration::from_secs(19);
    while matches!(
        stalled.status().state,
        ManagementPhase::Starting | ManagementPhase::Stopping
    ) && Instant::now() < deadline
    {
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(stalled.status().state, ManagementPhase::Failed);
    assert_eq!(stalled.status().diagnostic, Some("STARTUP_TIMEOUT"));
    assert!(stalled.child_pid().is_none());
    println!("Rust-owned API startup/readiness/create×2/validate/isolation/two-instances/stop/reap/timeout PASS");
}
