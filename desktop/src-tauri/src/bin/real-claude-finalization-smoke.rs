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
// Pinned backend 6a0dc9d: REFLECT_LLM_TIMEOUT_SECONDS defaults to 600.
// llm_calls is written only after the provider returns or errors.
const CLAUDE_CALL_LIMIT_SECS: u64 = 600;
const CLAUDE_STAGE_GRACE_SECS: u64 = 30;
const CLAUDE_STAGE_LIMIT: Duration =
    Duration::from_secs(CLAUDE_CALL_LIMIT_SECS + CLAUDE_STAGE_GRACE_SECS);
const OVERALL_LIMIT: Duration = Duration::from_secs(1800);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FinalizationStage {
    PreFinalization,
    SynthesisWait(Instant),
    ThesisWait(Instant),
    Complete,
}

#[derive(Clone, Copy)]
struct WatchFacts {
    done: bool,
    synthesis_complete: bool,
    thesis_complete: bool,
    synthesis_error: bool,
    thesis_error: bool,
    fallback_count: u32,
}

impl FinalizationStage {
    fn observe(&mut self, now: Instant, facts: WatchFacts) -> Result<(), &'static str> {
        if facts.fallback_count > 0 {
            return Err("BLOCKED_PROVIDER_FALLBACK");
        }
        if facts.synthesis_error {
            return Err("BLOCKED_SYNTHESIS_PROVIDER");
        }
        if facts.thesis_error {
            return Err("BLOCKED_THESIS_PROVIDER");
        }
        if !facts.done {
            return Ok(());
        }
        match self {
            Self::SynthesisWait(since) if now.duration_since(*since) > CLAUDE_STAGE_LIMIT => {
                return Err("BLOCKED_SYNTHESIS_TIMEOUT");
            }
            Self::ThesisWait(since) if now.duration_since(*since) > CLAUDE_STAGE_LIMIT => {
                return Err("BLOCKED_THESIS_TIMEOUT");
            }
            _ => {}
        }
        if facts.thesis_complete {
            *self = Self::Complete;
            return Ok(());
        }
        if facts.synthesis_complete {
            if !matches!(self, Self::ThesisWait(_)) {
                *self = Self::ThesisWait(now);
            }
        } else if matches!(self, Self::PreFinalization) {
            *self = Self::SynthesisWait(now);
        }
        match self {
            Self::SynthesisWait(since) if now.duration_since(*since) > CLAUDE_STAGE_LIMIT => {
                Err("BLOCKED_SYNTHESIS_TIMEOUT")
            }
            Self::ThesisWait(since) if now.duration_since(*since) > CLAUDE_STAGE_LIMIT => {
                Err("BLOCKED_THESIS_TIMEOUT")
            }
            _ => Ok(()),
        }
    }
}
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

#[derive(Deserialize, Debug)]
struct CycleFailureEvidence {
    cycle: u32,
    stage: String,
    error_class: String,
}

fn work_failure_gate(
    failures: &[CycleFailureEvidence],
    status: &str,
    payload_count: u32,
) -> Result<(), &'static str> {
    if !failures.is_empty() {
        return Err("BLOCKED_WORK_CYCLE");
    }
    if status == "failed" {
        return Err("BLOCKED_WORK_FAILURE_UNDIAGNOSED");
    }
    if status == "done" && payload_count == 0 {
        return Err("ZERO_PAYLOAD_DONE_INVARIANT");
    }
    Ok(())
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
    cycle_failures: Vec<CycleFailureEvidence>,
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
    error_code: Option<String>,
    response_bytes: u32,
    latency_ms: u32,
}

fn provider_failure_code(task: &str, safe_code: Option<&str>) -> &'static str {
    match (task, safe_code) {
        ("synthesis", Some("CLAUDE_CLI_NOT_FOUND")) => "BLOCKED_SYNTHESIS_CLAUDE_CLI_NOT_FOUND",
        ("synthesis", Some("CLAUDE_CLI_TIMEOUT")) => "BLOCKED_SYNTHESIS_CLAUDE_CLI_TIMEOUT",
        ("synthesis", Some("CLAUDE_CLI_EXIT_NONZERO")) => {
            "BLOCKED_SYNTHESIS_CLAUDE_CLI_EXIT_NONZERO"
        }
        ("synthesis", Some("CLAUDE_CLI_JSON_INVALID")) => {
            "BLOCKED_SYNTHESIS_CLAUDE_CLI_JSON_INVALID"
        }
        ("synthesis", Some("CLAUDE_CLI_JSON_NOT_OBJECT")) => {
            "BLOCKED_SYNTHESIS_CLAUDE_CLI_JSON_NOT_OBJECT"
        }
        ("synthesis", Some("CLAUDE_CLI_REPORTED_ERROR")) => {
            "BLOCKED_SYNTHESIS_CLAUDE_CLI_REPORTED_ERROR"
        }
        ("thesis", Some("CLAUDE_CLI_NOT_FOUND")) => "BLOCKED_THESIS_CLAUDE_CLI_NOT_FOUND",
        ("thesis", Some("CLAUDE_CLI_TIMEOUT")) => "BLOCKED_THESIS_CLAUDE_CLI_TIMEOUT",
        ("thesis", Some("CLAUDE_CLI_EXIT_NONZERO")) => "BLOCKED_THESIS_CLAUDE_CLI_EXIT_NONZERO",
        ("thesis", Some("CLAUDE_CLI_JSON_INVALID")) => "BLOCKED_THESIS_CLAUDE_CLI_JSON_INVALID",
        ("thesis", Some("CLAUDE_CLI_JSON_NOT_OBJECT")) => {
            "BLOCKED_THESIS_CLAUDE_CLI_JSON_NOT_OBJECT"
        }
        ("thesis", Some("CLAUDE_CLI_REPORTED_ERROR")) => "BLOCKED_THESIS_CLAUDE_CLI_REPORTED_ERROR",
        ("synthesis", _) => "BLOCKED_SYNTHESIS_PROVIDER_UNKNOWN",
        ("thesis", _) => "BLOCKED_THESIS_PROVIDER_UNKNOWN",
        _ => "BLOCKED_UNEXPECTED_PROVIDER_CALL",
    }
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

fn lease_available(config: &SupervisorConfig, project: &str) -> bool {
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
    status.success()
}

fn lease_probe(config: &SupervisorConfig, project: &str, expected_success: bool) {
    assert_eq!(
        lease_available(config, project),
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
    let mut failure_context: Option<String> = None;
    let mut child_stopped = false;
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
        assert!(before.cycle_failures.is_empty());
        let started = runtime.block_on(research.start()).unwrap();
        let live = started.runtime.unwrap();
        assert_eq!(live.research_state, "RUNNING");
        assert!(live.autonomous_task_alive);
        let deadline = Instant::now() + OVERALL_LIMIT;
        let mut watchdog = FinalizationStage::PreFinalization;
        let mut last_marker: Option<String> = None;
        let evidence = loop {
            let snapshot: Evidence = serde_json::from_str(&objective_helper(
                &config,
                &created.project.id,
                "finalization",
                Some(&objective_id),
            ))
            .unwrap();
            let supervisor_status = research.status();
            let liveness = research.last_liveness();
            let tools: Vec<String> = snapshot
                .tools
                .iter()
                .map(|tool| format!("{}:{}", tool.name, tool.success))
                .collect();
            let synthesis_calls = snapshot
                .llm_calls
                .iter()
                .filter(|call| call.task == "synthesis")
                .count();
            let thesis_calls = snapshot
                .llm_calls
                .iter()
                .filter(|call| call.task == "thesis")
                .count();
            let marker = format!(
                "id={} phase={:?} diagnostic={:?} child_alive={} liveness={} cycles={} payloads={} sources={} tools={:?} failures={:?} status={} synthesis_calls={} thesis_calls={} fallbacks={}",
                objective_id, supervisor_status.state, supervisor_status.diagnostic,
                Path::new(&format!("/proc/{pid}")).exists(),
                liveness.as_ref().map_or("UNKNOWN", |state| state.research_state.as_str()),
                snapshot.cycle_count,
                snapshot.payload_count, snapshot.sources_used.len(), tools,
                snapshot.cycle_failures.iter().map(|f| (&f.cycle, &f.stage, &f.error_class)).collect::<Vec<_>>(),
                snapshot.status,
                synthesis_calls, thesis_calls, snapshot.fallback_count,
            );
            failure_context = Some(format!(
                "{marker} completed_calls={:?}",
                snapshot
                    .llm_calls
                    .iter()
                    .map(|call| (
                        call.task.as_str(),
                        call.provider.as_str(),
                        call.outcome.as_str(),
                        call.error_code.as_deref(),
                        call.response_bytes,
                        call.latency_ms,
                    ))
                    .collect::<Vec<_>>()
            ));
            if last_marker.as_ref() != Some(&marker) {
                println!("progress: {marker}");
                last_marker = Some(marker);
            }
            if let Err(code) = work_failure_gate(
                &snapshot.cycle_failures,
                &snapshot.status,
                snapshot.payload_count,
            ) {
                panic!("{code}");
            }
            if supervisor_status.state == ResearchPhase::Failed {
                panic!("BLOCKED_BASE_RUNTIME");
            }
            assert!(Instant::now() < deadline, "BLOCKED_OVERALL_TIMEOUT");
            assert!(
                snapshot.cycle_count <= 3,
                "objective exceeded three-cycle budget"
            );
            assert_eq!(snapshot.objective_count, 1, "objective queue grew");
            assert_eq!(
                supervisor_status.state,
                ResearchPhase::Running,
                "BLOCKED_BASE_RUNTIME"
            );
            assert!(
                Path::new(&format!("/proc/{pid}")).exists(),
                "BLOCKED_CHILD_EXITED"
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
                snapshot.llm_calls.iter().all(|call| {
                    matches!(call.task.as_str(), "synthesis" | "thesis")
                        && call.provider == "claude-cli"
                }),
                "BLOCKED_UNEXPECTED_PROVIDER_CALL"
            );
            if let Some(call) = snapshot.llm_calls.iter().find(|call| call.outcome != "ok") {
                panic!(
                    "{}",
                    provider_failure_code(&call.task, call.error_code.as_deref())
                );
            }
            let synthesis_ok = snapshot
                .llm_calls
                .iter()
                .filter(|call| {
                    call.task == "synthesis"
                        && call.provider == "claude-cli"
                        && call.outcome == "ok"
                        && call.error_code.is_none()
                        && call.response_bytes > 0
                })
                .count()
                == 1;
            let thesis_ok = snapshot
                .llm_calls
                .iter()
                .filter(|call| {
                    call.task == "thesis"
                        && call.provider == "claude-cli"
                        && call.outcome == "ok"
                        && call.error_code.is_none()
                        && call.response_bytes > 0
                })
                .count()
                == 1;
            let now = Instant::now();
            let facts = WatchFacts {
                done: snapshot.status == "done",
                synthesis_complete: synthesis_ok && snapshot.synthesis_count == 1,
                thesis_complete: synthesis_ok && snapshot.synthesis_count == 1 && thesis_ok,
                synthesis_error: snapshot
                    .llm_calls
                    .iter()
                    .any(|call| call.task == "synthesis" && call.outcome != "ok"),
                thesis_error: snapshot
                    .llm_calls
                    .iter()
                    .any(|call| call.task == "thesis" && call.outcome != "ok"),
                fallback_count: snapshot.fallback_count,
            };
            if let Err(code) = watchdog.observe(now, facts) {
                panic!("{code}");
            }
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
                assert!(
                    liveness
                        .as_ref()
                        .is_some_and(|state| state.research_state == "RUNNING"
                            && state.autonomous_task_alive),
                    "BLOCKED_LIVENESS_UNHEALTHY"
                );
            }
            // Forced completion persists `done` before the Claude calls. Wait
            // for the bounded finalization outcome instead of treating that
            // intermediate state as a provider failure.
            thread::sleep(Duration::from_millis(750));
        };
        research.stop();
        child_stopped = true;
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
                        && call.error_code.is_none()
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
        assert!(after.cycle_failures.is_empty());
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
    if let Err(error) = run {
        let status = research.status();
        println!(
            "failure_capture: diagnostic={:?} child_alive={} last_liveness={:?} objective_snapshot={} management={:?} lease_held={}",
            status.diagnostic,
            research.child_pid().is_some_and(|pid| Path::new(&format!("/proc/{pid}")).exists()),
            research.last_liveness(),
            failure_context.as_deref().unwrap_or("NOT_STARTED"),
            management.status().state,
            failure_context.is_some() && !lease_available(&config, "research_claude_weather"),
        );
        if !child_stopped {
            research.stop();
        }
        management.stop();
        std::panic::resume_unwind(error);
    }
    management.stop();
}

#[cfg(test)]
mod watchdog_tests {
    use super::*;

    #[test]
    fn provider_failures_have_only_fixed_safe_diagnostics() {
        assert_eq!(
            provider_failure_code("synthesis", Some("CLAUDE_CLI_TIMEOUT")),
            "BLOCKED_SYNTHESIS_CLAUDE_CLI_TIMEOUT"
        );
        assert_eq!(
            provider_failure_code("thesis", Some("CLAUDE_CLI_REPORTED_ERROR")),
            "BLOCKED_THESIS_CLAUDE_CLI_REPORTED_ERROR"
        );
        assert_eq!(
            provider_failure_code("synthesis", Some("TOP_SECRET_DO_NOT_PERSIST")),
            "BLOCKED_SYNTHESIS_PROVIDER_UNKNOWN"
        );
    }

    #[test]
    fn first_durable_failure_stops_before_finalization_wait() {
        let failure = CycleFailureEvidence {
            cycle: 1,
            stage: "WORK_INFERENCE".into(),
            error_class: "ReadTimeout".into(),
        };
        assert_eq!(
            work_failure_gate(&[failure], "in_progress", 0),
            Err("BLOCKED_WORK_CYCLE")
        );
        assert_eq!(
            work_failure_gate(&[], "failed", 0),
            Err("BLOCKED_WORK_FAILURE_UNDIAGNOSED")
        );
        assert_eq!(
            work_failure_gate(&[], "done", 0),
            Err("ZERO_PAYLOAD_DONE_INVARIANT")
        );
        assert!(work_failure_gate(&[], "done", 1).is_ok());
    }

    fn facts(done: bool) -> WatchFacts {
        WatchFacts {
            done,
            synthesis_complete: false,
            thesis_complete: false,
            synthesis_error: false,
            thesis_error: false,
            fallback_count: 0,
        }
    }

    #[test]
    fn done_without_completed_call_is_valid_until_synthesis_stage_expires() {
        let t0 = Instant::now();
        let mut stage = FinalizationStage::PreFinalization;
        assert!(stage.observe(t0, facts(false)).is_ok());
        assert_eq!(stage, FinalizationStage::PreFinalization);
        assert!(stage.observe(t0, facts(true)).is_ok());
        assert!(stage
            .observe(t0 + Duration::from_secs(50), facts(true))
            .is_ok());
        assert!(stage
            .observe(t0 + Duration::from_secs(629), facts(true))
            .is_ok());
        assert_eq!(
            stage.observe(t0 + Duration::from_secs(631), facts(true)),
            Err("BLOCKED_SYNTHESIS_TIMEOUT")
        );
        let mut late = facts(true);
        late.synthesis_complete = true;
        assert_eq!(
            stage.observe(t0 + Duration::from_secs(632), late),
            Err("BLOCKED_SYNTHESIS_TIMEOUT")
        );
    }

    #[test]
    fn successful_synthesis_starts_an_independent_full_thesis_budget() {
        let t0 = Instant::now();
        let mut stage = FinalizationStage::PreFinalization;
        stage.observe(t0, facts(true)).unwrap();
        let synthesis_done = t0 + Duration::from_secs(620);
        let mut completed = facts(true);
        completed.synthesis_complete = true;
        stage.observe(synthesis_done, completed).unwrap();
        assert_eq!(stage, FinalizationStage::ThesisWait(synthesis_done));
        stage
            .observe(synthesis_done + Duration::from_secs(629), completed)
            .unwrap();
        assert_eq!(
            stage.observe(synthesis_done + Duration::from_secs(631), completed),
            Err("BLOCKED_THESIS_TIMEOUT")
        );
        completed.thesis_complete = true;
        assert_eq!(
            stage.observe(synthesis_done + Duration::from_secs(632), completed),
            Err("BLOCKED_THESIS_TIMEOUT")
        );
        let mut successful = FinalizationStage::ThesisWait(synthesis_done);
        successful
            .observe(synthesis_done + Duration::from_secs(629), completed)
            .unwrap();
        assert_eq!(successful, FinalizationStage::Complete);
    }

    #[test]
    fn provider_error_and_fallback_fail_without_waiting() {
        let now = Instant::now();
        let mut stage = FinalizationStage::PreFinalization;
        let mut state = facts(true);
        state.synthesis_error = true;
        assert_eq!(stage.observe(now, state), Err("BLOCKED_SYNTHESIS_PROVIDER"));
        state.synthesis_error = false;
        state.thesis_error = true;
        assert_eq!(stage.observe(now, state), Err("BLOCKED_THESIS_PROVIDER"));
        state.thesis_error = false;
        state.fallback_count = 1;
        assert_eq!(stage.observe(now, state), Err("BLOCKED_PROVIDER_FALLBACK"));
    }
}
