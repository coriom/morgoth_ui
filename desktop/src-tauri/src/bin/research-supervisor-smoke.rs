//! Disposable real Management child plus research failure-containment proof.
use morgoth_desktop::{
    research::{ResearchEngineSupervisor, ResearchPhase},
    supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig},
    CreateProjectRequest,
};
use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};

fn main() {
    assert!(
        std::env::vars_os().all(|(name, _)| !name
            .to_string_lossy()
            .starts_with("MORGOTH_DESKTOP_RESEARCH_")),
        "research configuration must be absent for this failure-containment smoke"
    );
    let home = tempfile::tempdir().expect("disposable home");
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(home.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let config = SupervisorConfig {
        backend_root: PathBuf::from(
            std::env::var_os("MORGOTH_DESKTOP_BACKEND_ROOT").expect("pinned backend root"),
        ),
        python: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_PYTHON").expect("backend Python")),
        home: home.path().into(),
    };
    let management = ManagementSupervisor::start(Ok(config.clone()));
    let deadline = Instant::now() + Duration::from_secs(22);
    while management.status().state == ManagementPhase::Starting && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(
        management.status().state,
        ManagementPhase::Ready,
        "real disposable Management startup"
    );
    let management_pid = management.child_pid().expect("owned Management child");
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let created = management
            .client()
            .unwrap()
            .create_project(&CreateProjectRequest {
                id: "research_probe".into(),
                name: "Research probe".into(),
                domain: "crypto".into(),
            })
            .await
            .unwrap();
        assert!(created.created && created.project.configuration_valid);
        let research = ResearchEngineSupervisor::new(Ok(config), management.clone());
        research.initialize("research_probe".into()).await.unwrap();
        let deadline = Instant::now() + Duration::from_secs(4);
        while research.status().state == ResearchPhase::Starting && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(research.status().state, ResearchPhase::Failed);
        assert_eq!(
            research.status().diagnostic,
            Some("RESEARCH_CONFIG_MISSING")
        );
        assert!(research.child_pid().is_none());
        assert_eq!(management.status().state, ManagementPhase::Ready);
        assert!(
            management
                .client()
                .unwrap()
                .get_project("research_probe")
                .await
                .unwrap()
                .configuration_valid
        );
        research.stop();
    });
    management.stop();
    assert!(!PathBuf::from(format!("/proc/{management_pid}")).exists());
    println!("Real disposable Management + Project; missing research config fails safely; Management survives; owned child reaped PASS");
}
