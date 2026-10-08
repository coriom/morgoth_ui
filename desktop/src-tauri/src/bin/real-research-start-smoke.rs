//! One disposable real Weather objective through the Rust-owned research child.
use morgoth_desktop::{
    research::{ResearchEngineSupervisor, ResearchPhase},
    supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig, BACKEND_SHA},
    CreateProjectRequest,
};
use serde::Deserialize;
use std::{
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const WEATHER_TOOLS: [&str; 3] = [
    "get_weather_forecast_met",
    "find_nws_observation_stations",
    "get_nws_weather_observation",
];
const REQUIRED_OBJECTIVE_COLUMNS: [&str; 16] = [
    "objective_id",
    "title",
    "description",
    "category",
    "priority",
    "generated_by",
    "status",
    "evidence",
    "created_at",
    "completed_at",
    "user_id",
    "cycle_count",
    "sources_used",
    "consecutive_network_outage_cycles",
    "campaign_id",
    "updated_at",
];

#[derive(Deserialize)]
struct SchemaEvidence {
    schema_exists: bool,
    objectives_exists: bool,
    columns: Vec<String>,
}

#[derive(Deserialize)]
struct ToolEvidence {
    name: String,
    success: bool,
}

#[derive(Deserialize)]
struct Evidence {
    objective_id: String,
    objective_count: u32,
    generated_by: String,
    status: String,
    cycle_count: u32,
    payload_count: u32,
    tools: Vec<ToolEvidence>,
    llm_result_logs: u32,
}

fn objective_helper(
    config: &SupervisorConfig,
    project: &str,
    operation: &str,
    objective_id: Option<&str>,
) -> String {
    let script = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("scripts/one_objective_db.py");
    let dsn = std::env::var("MORGOTH_TEST_POSTGRES_URL").expect("test database URL");
    assert!(
        dsn.starts_with("postgresql://")
            && dsn.split('?').next().unwrap().ends_with("/morgoth_test")
    );
    let mut command = Command::new(&config.python);
    command
        .arg("-B")
        .arg(script)
        .arg(operation)
        .current_dir(&config.backend_root)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", &config.home)
        .env("PYTHONPATH", &config.backend_root)
        .env("MORGOTH_HOME", &config.home)
        .env("MORGOTH_PROJECT", project)
        .env("MORGOTH_TEST_POSTGRES_URL", &dsn)
        .env("POSTGRES_URL", &dsn)
        .env(
            "OLLAMA_BASE_URL",
            std::env::var("MORGOTH_DESKTOP_RESEARCH_OLLAMA_BASE_URL").unwrap(),
        )
        .env(
            "OLLAMA_PRIMARY_MODEL",
            std::env::var("MORGOTH_DESKTOP_RESEARCH_OLLAMA_PRIMARY_MODEL").unwrap(),
        )
        .env(
            "OLLAMA_AGENT_MODEL",
            std::env::var("MORGOTH_DESKTOP_RESEARCH_OLLAMA_AGENT_MODEL").unwrap(),
        )
        .env("SECRET_KEY", "disposable-test-only")
        .env("MAX_CONCURRENT_AGENTS", "1")
        .env("LOG_RETENTION_DAYS", "1")
        .env("LOG_LEVEL_THOUGHT", "false")
        .stderr(Stdio::piped());
    if let Some(id) = objective_id {
        command.args(["--objective-id", id]);
    }
    let output = command.output().expect("objective helper");
    assert!(
        output.status.success(),
        "disposable objective operation failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap().trim().to_owned()
}

fn wait_phase(research: &ResearchEngineSupervisor, expected: ResearchPhase) {
    let deadline = Instant::now() + Duration::from_secs(55);
    while research.status().state == ResearchPhase::Starting && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(research.status().state, expected);
}

fn lease_probe(config: &SupervisorConfig, project: &str, expected_success: bool) {
    let code = "from core.project import current_project; from core.project_engine_lease import ProjectEngineLease; p=current_project(); assert p.id==__import__('sys').argv[1];\nwith ProjectEngineLease(p): pass";
    let status = Command::new(&config.python)
        .args(["-B", "-c", code, project])
        .current_dir(&config.backend_root)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", &config.home)
        .env("MORGOTH_HOME", &config.home)
        .env("MORGOTH_PROJECT", project)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .unwrap();
    assert_eq!(
        status.success(),
        expected_success,
        "actual Project lease state"
    );
}

fn main() {
    assert_eq!(
        std::env::var("MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL").unwrap(),
        std::env::var("MORGOTH_TEST_POSTGRES_URL").unwrap()
    );
    let home = tempfile::Builder::new()
        .prefix("morgoth-one-objective-")
        .tempdir()
        .unwrap();
    std::fs::set_permissions(home.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let config = SupervisorConfig {
        backend_root: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_BACKEND_ROOT").unwrap()),
        python: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_PYTHON").unwrap()),
        home: home.path().to_path_buf(),
    };
    let management = ManagementSupervisor::start(Ok(config.clone()));
    let deadline = Instant::now() + Duration::from_secs(25);
    while management.status().state == ManagementPhase::Starting && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(
        management.status().state,
        ManagementPhase::Ready,
        "Management diagnostic: {:?}",
        management.status().diagnostic
    );
    let research = ResearchEngineSupervisor::new(Ok(config.clone()), management.clone());
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let run = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let client = management.client().unwrap();
        let created = runtime
            .block_on(client.create_project(&CreateProjectRequest {
                id: "research_one_weather".into(),
                name: "Disposable Weather qualification".into(),
                domain: "weather".into(),
            }))
            .unwrap();
        assert!(created.created && created.project.configuration_valid);
        let before_schema: SchemaEvidence = serde_json::from_str(&objective_helper(
            &config,
            &created.project.id,
            "schema",
            None,
        ))
        .unwrap();
        assert!(!before_schema.schema_exists && !before_schema.objectives_exists);
        runtime
            .block_on(research.initialize(created.project.id.clone()))
            .unwrap();
        wait_phase(&research, ResearchPhase::Paused);
        let status = research.status().runtime.unwrap();
        assert_eq!(status.code_sha.as_deref(), Some(BACKEND_SHA));
        assert_eq!(status.project, created.project.id);
        assert_eq!(status.domain, "weather");
        assert!(status.initialized && status.awakening_ready);
        assert!(!status.autonomous_task_alive);
        let after_schema: SchemaEvidence = serde_json::from_str(&objective_helper(
            &config,
            &created.project.id,
            "schema",
            None,
        ))
        .unwrap();
        assert!(after_schema.schema_exists && after_schema.objectives_exists);
        assert!(REQUIRED_OBJECTIVE_COLUMNS
            .iter()
            .all(|column| after_schema.columns.iter().any(|actual| actual == column)));
        let pid = research.child_pid().unwrap();
        let child_env = std::fs::read(format!("/proc/{pid}/environ")).unwrap();
        assert!(!child_env
            .windows(b"FAKE_PARENT_ONLY_DO_NOT_INHERIT".len())
            .any(|window| window == b"FAKE_PARENT_ONLY_DO_NOT_INHERIT"));
        assert!(!child_env
            .windows(b"ANTHROPIC_API_KEY=".len())
            .any(|window| window == b"ANTHROPIC_API_KEY="));
        lease_probe(&config, &created.project.id, false);
        let profiles = runtime.block_on(research.profiles()).unwrap();
        assert_eq!(
            profiles
                .profiles
                .iter()
                .find(|p| p.id == "codex")
                .unwrap()
                .status,
            "BLOCKED"
        );
        let refused = runtime.block_on(research.start());
        assert!(refused.is_err(), "blocked legacy profile must refuse START");
        assert!(!research.status().runtime.unwrap().autonomous_task_alive);
        assert_eq!(management.status().state, ManagementPhase::Ready);
        let claude = profiles.profiles.iter().find(|p| p.id == "claude").unwrap();
        println!("real profiles: claude={} codex=BLOCKED", claude.status);
        if claude.status != "READY" {
            panic!("BLOCKED_CLAUDE_READINESS; no successful START attempted");
        }
        let selected = runtime.block_on(research.select_profile("claude")).unwrap();
        assert_eq!(selected.current, "claude");
        assert_eq!(research.status().state, ResearchPhase::Paused);
        let objective_id = objective_helper(&config, &created.project.id, "seed", None);
        let before: Evidence = serde_json::from_str(&objective_helper(
            &config,
            &created.project.id,
            "inspect",
            Some(&objective_id),
        ))
        .unwrap();
        assert_eq!(
            (
                before.objective_count,
                before.cycle_count,
                before.payload_count
            ),
            (1, 0, 0)
        );
        assert_eq!(before.generated_by, "human");
        assert_eq!(before.status, "pending");
        assert!(before.tools.is_empty() && before.llm_result_logs == 0);
        let started = runtime.block_on(research.start()).unwrap();
        let live = started.runtime.unwrap();
        assert_eq!(live.research_state, "RUNNING");
        assert!(live.autonomous_task_alive);
        let deadline = Instant::now() + Duration::from_secs(300);
        let evidence = loop {
            assert!(Instant::now() < deadline, "first objective cycle timed out");
            let snapshot: Evidence = serde_json::from_str(&objective_helper(
                &config,
                &created.project.id,
                "inspect",
                Some(&objective_id),
            ))
            .unwrap();
            assert!(snapshot.cycle_count <= 1, "second objective cycle began");
            assert_eq!(snapshot.objective_count, 1, "objective queue grew");
            if snapshot.payload_count > 0 {
                break snapshot;
            }
            thread::sleep(Duration::from_millis(500));
        };
        research.stop();
        assert_eq!(research.status().state, ResearchPhase::Stopped);
        assert!(!Path::new(&format!("/proc/{pid}")).exists());
        lease_probe(&config, &created.project.id, true);
        assert_eq!(management.status().state, ManagementPhase::Ready);
        assert_eq!(evidence.objective_id, objective_id);
        assert_eq!(evidence.cycle_count, 1);
        assert_eq!(evidence.payload_count, 1);
        assert!(
            evidence.llm_result_logs >= 1,
            "actual Ollama cycle result absent"
        );
        assert!(
            evidence
                .tools
                .iter()
                .any(|tool| WEATHER_TOOLS.contains(&tool.name.as_str())),
            "no Weather research tool called"
        );
        thread::sleep(Duration::from_secs(2));
        let after: Evidence = serde_json::from_str(&objective_helper(
            &config,
            &created.project.id,
            "inspect",
            Some(&objective_id),
        ))
        .unwrap();
        assert_eq!(after.cycle_count, 1);
        assert_eq!(after.objective_count, 1);
        assert_eq!(after.payload_count, 1);
        println!(
            "objective={} cycles=1 payloads=1 ollama_result_logs={} tools={}",
            objective_id,
            evidence.llm_result_logs,
            evidence
                .tools
                .iter()
                .map(|t| format!("{}:{}", t.name, t.success))
                .collect::<Vec<_>>()
                .join(",")
        );
        println!("real one-objective START; exact-child stop; Management alive PASS");
    }));
    research.stop();
    management.stop();
    if let Err(error) = run {
        std::panic::resume_unwind(error);
    }
}
