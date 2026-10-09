//! Disposable real-backend PAUSED integration; never sends /start or provider prompts.
use morgoth_desktop::{
    research::{ResearchEngineSupervisor, ResearchPhase},
    supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig, BACKEND_SHA},
    CreateProjectRequest, ProjectView,
};
use std::{
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

fn wait_management(supervisor: &ManagementSupervisor) {
    let deadline = Instant::now() + Duration::from_secs(25);
    while matches!(
        supervisor.status().state,
        ManagementPhase::Starting | ManagementPhase::Stopping
    ) && Instant::now() < deadline
    {
        thread::sleep(Duration::from_millis(100));
    }
    let status = supervisor.status();
    assert_eq!(
        status.state,
        ManagementPhase::Ready,
        "management startup: {:?}",
        status.diagnostic
    );
}

fn wait_research(supervisor: &ResearchEngineSupervisor, expected: ResearchPhase) {
    let deadline = Instant::now() + Duration::from_secs(55);
    while supervisor.status().state == ResearchPhase::Starting && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    let status = supervisor.status();
    assert_eq!(
        status.state, expected,
        "research startup: {:?}",
        status.diagnostic
    );
    let runtime = status
        .runtime
        .expect("authenticated strict runtime response");
    assert_eq!(runtime.code_sha.as_deref(), Some(BACKEND_SHA));
    assert!(runtime.initialized);
    assert!(!runtime.autonomous_task_alive);
    assert_eq!(
        runtime.research_state,
        if expected == ResearchPhase::Paused {
            "PAUSED"
        } else {
            "NOT_READY"
        }
    );
    assert_eq!(runtime.awakening_ready, expected == ResearchPhase::Paused);
    assert!(supervisor.child_pid().is_some(), "owned Python child alive");
}

fn lease_probe(config: &SupervisorConfig, project: &ProjectView, should_succeed: bool) {
    // A separate Python process obtains the actual backend advisory lease, without
    // importing the research server or opening the database.
    let code = "from core.project import current_project; from core.project_engine_lease import ProjectEngineLease; p=current_project(); assert p.id==__import__('sys').argv[1];\nwith ProjectEngineLease(p): pass";
    let status = Command::new(&config.python)
        .args(["-B", "-c", code, &project.id])
        .current_dir(&config.backend_root)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", &config.home)
        .env("MORGOTH_HOME", &config.home)
        .env("MORGOTH_PROJECT", &project.id)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("lease probe process");
    assert_eq!(
        status.success(),
        should_succeed,
        "independent Project lease"
    );
}

fn duplicate_launcher(config: &SupervisorConfig, project: &ProjectView) {
    // The real launcher must reject the duplicate before importing api.server.
    let output = Command::new(&config.python)
        .args(["-B", "-m", "scripts.research_engine", "--home"])
        .arg(&config.home)
        .args(["--project", &project.id, "--port", "49191"])
        .current_dir(&config.backend_root)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", &config.home)
        .env(
            "POSTGRES_URL",
            std::env::var("MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL").unwrap(),
        )
        .env(
            "OLLAMA_BASE_URL",
            std::env::var("MORGOTH_DESKTOP_RESEARCH_OLLAMA_BASE_URL").unwrap(),
        )
        .env("OLLAMA_PRIMARY_MODEL", "test-primary")
        .env("OLLAMA_AGENT_MODEL", "test-agent")
        .env("SECRET_KEY", "synthetic-disposable-key")
        .env("MAX_CONCURRENT_AGENTS", "1")
        .env("LOG_RETENTION_DAYS", "1")
        .env("LOG_LEVEL_THOUGHT", "false")
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .expect("duplicate actual launcher");
    assert_eq!(output.status.code(), Some(3));
    assert_eq!(output.stderr.trim_ascii(), b"PROJECT_ENGINE_ALREADY_ACTIVE");
}

fn assert_no_tool_artifacts(project: &ProjectView) {
    let workspace = project.workspace_root.as_ref().expect("managed workspace");
    assert!(!Path::new(workspace).join("data/tool_test.txt").exists());
    assert_eq!(std::fs::read_dir(workspace).unwrap().count(), 0);
    assert!(Path::new(&project.runtime_dir)
        .join(".research-engine.lock")
        .is_file());
    assert!(Path::new(&project.runtime_dir)
        .join("auth/ui_token")
        .is_file());
}

fn assert_test_schema(config: &SupervisorConfig, project: &ProjectView) {
    let code = "import asyncio,asyncpg,os,sys;\nasync def main():\n c=await asyncpg.connect(os.environ['MORGOTH_TEST_POSTGRES_URL']);\n try:\n  assert await c.fetchval('SELECT current_database()')=='morgoth_test';\n  assert await c.fetchval('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1)',sys.argv[1]);\n finally: await c.close()\nasyncio.run(main())";
    let status = Command::new(&config.python)
        .args(["-B", "-c", code, &project.postgres_schema])
        .current_dir(&config.backend_root)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", &config.home)
        .env(
            "MORGOTH_TEST_POSTGRES_URL",
            std::env::var("MORGOTH_TEST_POSTGRES_URL").unwrap(),
        )
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("test-schema query");
    assert!(status.success(), "Project schema exists in morgoth_test");
}

fn drop_test_schemas(config: &SupervisorConfig, projects: &[ProjectView]) {
    let mut command = Command::new(&config.python);
    command.arg("-B").arg("-c").arg(
        "import asyncio,asyncpg,os,re,sys;\nasync def main():\n c=await asyncpg.connect(os.environ['MORGOTH_TEST_POSTGRES_URL']);\n try:\n  assert await c.fetchval('SELECT current_database()')=='morgoth_test';\n  for s in sys.argv[1:]:\n   assert re.fullmatch(r'[a-z][a-z0-9_]*',s) and s!='public';\n   await c.execute('DROP SCHEMA IF EXISTS '+s+' CASCADE');\n finally: await c.close()\nasyncio.run(main())"
    );
    for project in projects {
        command.arg(&project.postgres_schema);
    }
    let status = command
        .current_dir(&config.backend_root)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", &config.home)
        .env(
            "MORGOTH_TEST_POSTGRES_URL",
            std::env::var("MORGOTH_TEST_POSTGRES_URL").unwrap(),
        )
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("test-schema cleanup");
    assert!(status.success(), "disposable schema cleanup");
}

fn main() {
    let not_ready_only = std::env::args().nth(1).as_deref() == Some("--not-ready");
    let codex_readiness = std::env::args().nth(1).as_deref() == Some("--codex-readiness");
    let dsn = std::env::var("MORGOTH_TEST_POSTGRES_URL").expect("test DB URL");
    assert!(
        dsn.starts_with("postgresql://")
            && dsn.split('?').next().unwrap().ends_with("/morgoth_test")
    );
    assert_eq!(
        std::env::var("MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL").unwrap(),
        dsn
    );
    let home = tempfile::Builder::new()
        .prefix("morgoth-real-paused-")
        .tempdir()
        .unwrap();
    std::fs::set_permissions(home.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let config = SupervisorConfig {
        backend_root: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_BACKEND_ROOT").unwrap()),
        python: PathBuf::from(std::env::var_os("MORGOTH_DESKTOP_PYTHON").unwrap()),
        home: home.path().to_path_buf(),
    };
    let management = ManagementSupervisor::start(Ok(config.clone()));
    wait_management(&management);
    let management_pid = management.child_pid().unwrap();
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let client = management.client().unwrap();
    let mut projects = Vec::new();
    for (id, domain) in [
        ("research_real_crypto", "crypto"),
        ("research_real_weather", "weather"),
        ("research_real_other", "crypto"),
        ("research_real_not_ready", "weather"),
    ] {
        let created = rt
            .block_on(client.create_project(&CreateProjectRequest {
                id: id.into(),
                name: id.into(),
                domain: domain.into(),
            }))
            .unwrap();
        assert!(created.created && created.project.configuration_valid);
        projects.push(created.project);
    }
    assert_ne!(projects[0].postgres_schema, projects[2].postgres_schema);
    let research = ResearchEngineSupervisor::new(Ok(config.clone()), management.clone());
    let run_projects: &[ProjectView] = if not_ready_only {
        &projects[3..4]
    } else if codex_readiness {
        &projects[..1]
    } else {
        &projects[..2]
    };
    for project in run_projects {
        rt.block_on(research.initialize(project.id.clone()))
            .unwrap();
        wait_research(
            &research,
            if not_ready_only {
                ResearchPhase::NotReady
            } else {
                ResearchPhase::Paused
            },
        );
        let status = research.status().runtime.unwrap();
        assert_eq!(status.project, project.id);
        assert_eq!(status.domain, project.domain);
        assert_test_schema(&config, project);
        assert_no_tool_artifacts(project);
        let profiles = rt.block_on(research.profiles()).unwrap();
        assert_eq!(profiles.schema_version, 1);
        assert_eq!(profiles.current, "legacy");
        if codex_readiness {
            assert!(profiles.codex.installed);
            assert!(profiles.codex.authenticated);
            assert!(profiles.codex.sandbox_available);
            println!("exact sanitized native Codex discovery and confined login PASS");
        }
        assert!(!profiles.codex.sandbox_qualified);
        assert!(!profiles.codex.workloads_ready);
        assert_eq!(
            profiles
                .profiles
                .iter()
                .find(|p| p.id == "codex")
                .unwrap()
                .status,
            "BLOCKED"
        );
        assert_eq!(
            profiles
                .profiles
                .iter()
                .find(|p| p.id == "legacy")
                .unwrap()
                .status,
            status.profile_status
        );
        println!(
            "{} profile catalog: legacy={}, codex=BLOCKED; sandbox qualified=false",
            project.domain, status.profile_status
        );
        if project.id == "research_real_crypto" {
            duplicate_launcher(&config, project);
            lease_probe(&config, &projects[2], true);
        }
        let pid = research.child_pid().unwrap();
        research.stop();
        assert_eq!(research.status().state, ResearchPhase::Stopped);
        assert!(!PathBuf::from(format!("/proc/{pid}")).exists());
        assert_eq!(management.status().state, ManagementPhase::Ready);
        lease_probe(&config, project, true);
        // A read-only check may retry a transient closed keep-alive connection;
        // creation and other mutations are never retried.
        let mut catalog_visible = false;
        for _ in 0..3 {
            if rt
                .block_on(client.get_project(&project.id))
                .ok()
                .is_some_and(|p| p.configuration_valid)
            {
                catalog_visible = true;
                break;
            }
            thread::sleep(Duration::from_millis(150));
        }
        assert!(
            catalog_visible,
            "Management catalog remains available after research stop"
        );
        if project.id == "research_real_crypto" {
            rt.block_on(research.initialize(project.id.clone()))
                .unwrap();
            wait_research(&research, ResearchPhase::Paused);
            research.stop();
            lease_probe(&config, project, true);
        }
    }
    drop_test_schemas(&config, &projects);
    management.stop();
    assert!(!PathBuf::from(format!("/proc/{management_pid}")).exists());
    if not_ready_only {
        println!("real NOT_READY; Management survived; exact-child reaping PASS");
    } else if codex_readiness {
        println!("real Crypto PAUSED; installed/authenticated/sandbox available; Codex BLOCKED; exact-child reaping PASS");
    } else {
        println!("real Crypto PAUSED; Weather PAUSED; lease conflict/release; Codex BLOCKED; exact-child reaping PASS");
    }
}
