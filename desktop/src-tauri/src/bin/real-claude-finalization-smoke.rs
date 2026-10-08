//! One disposable multi-source Weather objective through real Claude finalization.
use morgoth_desktop::{
    research::{ResearchEngineSupervisor, ResearchPhase},
    supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig, BACKEND_SHA},
    CreateProjectRequest,
};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::{
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const MEASUREMENT_TOOLS: [&str; 2] = ["get_weather_forecast_met", "get_nws_weather_observation"];
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
    sources_used: Vec<String>,
    payload_count: u32,
    tools: Vec<ToolEvidence>,
    synthesis_count: u32,
    synthesis_bytes: u32,
    synthesis_md5: Option<String>,
    synthesis_sources: Vec<String>,
    llm_calls: Vec<LlmCall>,
    fallback_count: u32,
    theses: Vec<ThesisEvidence>,
    persisted_drop_subject_count: u32,
    persisted_accepted_subject_count: u32,
    fidelity_actions: BTreeMap<String, u32>,
    fidelity_reasons: BTreeMap<String, u32>,
    field_confusion_count: u32,
    abstention_count: u32,
}

#[derive(Deserialize)]
struct LlmCall {
    task: String,
    provider: String,
    outcome: String,
    response_bytes: u32,
}

#[derive(Deserialize)]
struct ThesisEvidence {
    id: String,
}

fn objective_helper(
    config: &SupervisorConfig,
    project: &str,
    operation: &str,
    objective_id: Option<&str>,
) -> String {
    let scripts = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("scripts");
    let script = if operation == "finalization" {
        scripts.join("finalization_evidence.py")
    } else {
        scripts.join("one_objective_db.py")
    };
    let dsn = std::env::var("MORGOTH_TEST_POSTGRES_URL").expect("test database URL");
    assert!(
        dsn.starts_with("postgresql://")
            && dsn.split('?').next().unwrap().ends_with("/morgoth_test")
    );
    let mut command = Command::new(&config.python);
    command
        .arg("-B")
        .arg(script)
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
        .stderr(Stdio::null());
    if operation != "finalization" {
        command.arg(operation);
    }
    if let Some(id) = objective_id {
        command.args(["--objective-id", id]);
    }
    if operation == "seed" {
        command.args(["--scenario", "finalization"]);
    }
    let output = command.output().expect("objective helper");
    assert!(
        output.status.success(),
        "disposable objective helper failed"
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
        std::env::var("MORGOTH_DESKTOP_RESEARCH_MAX_CYCLES_PER_OBJECTIVE").unwrap(),
        "3"
    );
    assert_eq!(
        std::env::var("MORGOTH_DESKTOP_RESEARCH_LLM_FALLBACK_ENABLED").unwrap(),
        "false"
    );
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
                id: "research_claude_weather".into(),
                name: "Disposable Claude finalization qualification".into(),
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
        assert!(child_env
            .windows(b"MAX_CYCLES_PER_OBJECTIVE=3".len())
            .any(|w| w == b"MAX_CYCLES_PER_OBJECTIVE=3"));
        assert!(child_env
            .windows(b"LLM_FALLBACK_ENABLED=false".len())
            .any(|w| w == b"LLM_FALLBACK_ENABLED=false"));
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
        let selected_runtime = research.status().runtime.unwrap();
        assert_eq!(selected_runtime.profile, "claude");
        assert_eq!(selected_runtime.profile_status, "READY");
        let objective_id = objective_helper(&config, &created.project.id, "seed", None);
        println!("disposable_objective_id={objective_id}");
        let before: Evidence = serde_json::from_str(&objective_helper(
            &config,
            &created.project.id,
            "finalization",
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
        assert!(before.tools.is_empty() && before.sources_used.is_empty());
        assert_eq!(before.synthesis_count, 0);
        assert!(before.llm_calls.is_empty() && before.theses.is_empty());
        assert_eq!(before.abstention_count, 0);
        assert_eq!(before.fallback_count, 0);
        let started = runtime.block_on(research.start()).unwrap();
        let live = started.runtime.unwrap();
        assert_eq!(live.research_state, "RUNNING");
        assert!(live.autonomous_task_alive);
        let deadline = Instant::now() + Duration::from_secs(750);
        let mut done_progress: Option<(Instant, usize, u32)> = None;
        let mut last_marker: Option<(u32, u32, u32, usize, String)> = None;
        let evidence = loop {
            assert!(
                Instant::now() < deadline,
                "real finalization timed out at bounded metadata {last_marker:?}"
            );
            let snapshot: Evidence = serde_json::from_str(&objective_helper(
                &config,
                &created.project.id,
                "finalization",
                Some(&objective_id),
            ))
            .unwrap();
            let marker = (
                snapshot.cycle_count,
                snapshot.payload_count,
                snapshot.synthesis_count,
                snapshot.llm_calls.len(),
                snapshot.status.clone(),
            );
            if last_marker.as_ref() != Some(&marker) {
                println!(
                    "progress: cycles={} payloads={} synthesis={} claude_calls={} status={} sources={}",
                    marker.0,
                    marker.1,
                    marker.2,
                    marker.3,
                    marker.4,
                    snapshot.sources_used.len()
                );
                last_marker = Some(marker);
            }
            assert!(
                snapshot.cycle_count <= 3,
                "objective exceeded three-cycle budget"
            );
            assert_eq!(snapshot.objective_count, 1, "objective queue grew");
            assert_eq!(snapshot.fallback_count, 0, "provider fallback occurred");
            let supervisor_status = research.status();
            assert_ne!(
                supervisor_status.state,
                ResearchPhase::Failed,
                "research supervisor failed: diagnostic={:?} child_alive={} at bounded metadata {last_marker:?}",
                supervisor_status.diagnostic,
                Path::new(&format!("/proc/{pid}")).exists(),
            );
            assert!(
                research
                    .status()
                    .runtime
                    .as_ref()
                    .is_some_and(|status| status.autonomous_task_alive),
                "autonomous task stopped before finalization"
            );
            assert!(
                snapshot.llm_calls.iter().all(|call| call.outcome == "ok"),
                "Claude provider call failed"
            );
            let synthesis_ok = snapshot
                .llm_calls
                .iter()
                .filter(|call| {
                    call.task == "synthesis"
                        && call.provider == "claude-cli"
                        && call.outcome == "ok"
                })
                .count()
                == 1;
            let thesis_ok = snapshot
                .llm_calls
                .iter()
                .filter(|call| {
                    call.task == "thesis" && call.provider == "claude-cli" && call.outcome == "ok"
                })
                .count()
                == 1;
            if snapshot.status == "done"
                && snapshot.synthesis_count == 1
                && synthesis_ok
                && thesis_ok
                && (!snapshot.theses.is_empty() || snapshot.abstention_count > 0)
            {
                break snapshot;
            }
            if snapshot.status == "done" {
                assert!(
                    MEASUREMENT_TOOLS
                        .iter()
                        .all(|tool| snapshot.sources_used.iter().any(|used| used == tool)),
                    "objective completed without both measurement sources"
                );
                let marker = (snapshot.llm_calls.len(), snapshot.synthesis_count);
                if done_progress
                    .as_ref()
                    .is_none_or(|(_, calls, syntheses)| (*calls, *syntheses) != marker)
                {
                    done_progress = Some((Instant::now(), marker.0, marker.1));
                }
                assert!(
                    done_progress.as_ref().unwrap().0.elapsed() < Duration::from_secs(50),
                    "finalization stalled after objective completion"
                );
            }
            if snapshot.status == "done"
                && snapshot.cycle_count >= 3
                && snapshot.llm_calls.is_empty()
            {
                panic!("objective completed without Claude finalization");
            }
            thread::sleep(Duration::from_millis(750));
        };
        research.stop();
        assert_eq!(research.status().state, ResearchPhase::Stopped);
        assert!(!Path::new(&format!("/proc/{pid}")).exists());
        lease_probe(&config, &created.project.id, true);
        assert_eq!(management.status().state, ManagementPhase::Ready);
        assert_eq!(evidence.objective_id, objective_id);
        assert!(evidence.cycle_count <= 3 && evidence.payload_count >= 2);
        for tool in MEASUREMENT_TOOLS {
            assert!(
                evidence.sources_used.iter().any(|source| source == tool),
                "required source not counted: {tool}"
            );
            assert!(
                evidence
                    .tools
                    .iter()
                    .any(|result| result.name == tool && result.success),
                "required successful tool result absent: {tool}"
            );
            assert!(
                evidence
                    .synthesis_sources
                    .iter()
                    .any(|source| source == tool),
                "synthesis omitted required source: {tool}"
            );
        }
        assert!(evidence.synthesis_bytes > 0 && evidence.synthesis_md5.is_some());
        for task in ["synthesis", "thesis"] {
            assert_eq!(
                evidence
                    .llm_calls
                    .iter()
                    .filter(|call| call.task == task
                        && call.provider == "claude-cli"
                        && call.outcome == "ok"
                        && call.response_bytes > 0)
                    .count(),
                1,
                "Claude {task} call count"
            );
        }
        assert_eq!(
            evidence.llm_calls.len(),
            2,
            "unexpected finalization LLM calls"
        );
        if evidence.theses.is_empty() {
            assert_eq!(
                evidence.abstention_count, 1,
                "empty extraction requires abstention"
            );
            println!(
                "thesis_outcome=ABSTAIN numeric_live_candidate={}",
                if evidence.fidelity_actions.is_empty() {
                    "NOT_EXERCISED"
                } else {
                    "EXERCISED_NO_SURVIVOR"
                }
            );
        } else {
            assert_eq!(evidence.abstention_count, 0);
            let accepted = evidence.fidelity_actions.get("pass").copied().unwrap_or(0)
                + evidence
                    .fidelity_actions
                    .get("rewrite")
                    .copied()
                    .unwrap_or(0);
            assert!(
                accepted >= evidence.theses.len() as u32,
                "persisted thesis lacks accepted fidelity gate"
            );
            assert_eq!(
                evidence.persisted_drop_subject_count, 0,
                "persisted thesis matches a dropped subject"
            );
            assert_eq!(
                evidence.persisted_accepted_subject_count,
                evidence.theses.len() as u32
            );
            println!(
                "thesis_outcome=PERSISTED count={} numeric_live_candidate=EXERCISED",
                evidence.theses.len()
            );
        }
        thread::sleep(Duration::from_secs(2));
        let after: Evidence = serde_json::from_str(&objective_helper(
            &config,
            &created.project.id,
            "finalization",
            Some(&objective_id),
        ))
        .unwrap();
        assert_eq!(after.cycle_count, evidence.cycle_count);
        assert_eq!(after.objective_count, 1);
        assert_eq!(after.payload_count, evidence.payload_count);
        println!(
            "objective={} cycles={} payloads={} synthesis_bytes={} synthesis_md5={} tools={}",
            objective_id,
            evidence.cycle_count,
            evidence.payload_count,
            evidence.synthesis_bytes,
            evidence.synthesis_md5.as_deref().unwrap_or("none"),
            evidence
                .tools
                .iter()
                .map(|t| format!("{}:{}", t.name, t.success))
                .collect::<Vec<_>>()
                .join(",")
        );
        println!("Claude calls: synthesis=1 thesis=1; fallback=0; fidelity={:?}; reasons={:?}; confusion={}; thesis_ids={}; exact-child stop; Management alive PASS", evidence.fidelity_actions, evidence.fidelity_reasons, evidence.field_confusion_count, evidence.theses.iter().map(|t| t.id.as_str()).collect::<Vec<_>>().join(","));
    }));
    research.stop();
    management.stop();
    if let Err(error) = run {
        std::panic::resume_unwind(error);
    }
}
