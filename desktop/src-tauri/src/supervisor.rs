//! Linux development-only owner of one pinned Management API child.
use crate::{ManagementClient, NativeError};
use base64::Engine;
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::TcpListener,
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Component, Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

pub const BACKEND_SHA: &str = "1afa971ea55fe58623e47d4493e6f09dba63ee5e";
const STARTUP_LIMIT: Duration = Duration::from_secs(15);
const STOP_GRACE: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ManagementPhase {
    Starting,
    Ready,
    Failed,
    Stopping,
    Stopped,
}

#[derive(Clone, Serialize)]
pub struct ManagementRuntimeStatus {
    pub state: ManagementPhase,
    pub diagnostic: Option<&'static str>,
}

#[derive(Clone)]
pub struct SupervisorConfig {
    pub backend_root: PathBuf,
    pub python: PathBuf,
    pub home: PathBuf,
}

impl SupervisorConfig {
    /// Read trusted native-only development locators; no WebView argument controls them.
    pub fn from_environment() -> Result<Self, &'static str> {
        let read = |name| {
            std::env::var_os(name)
                .map(PathBuf::from)
                .ok_or("CONFIG_MISSING")
        };
        Ok(Self {
            backend_root: read("MORGOTH_DESKTOP_BACKEND_ROOT")?,
            python: read("MORGOTH_DESKTOP_PYTHON")?,
            home: read("MORGOTH_DESKTOP_HOME")?,
        })
    }

    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        for path in [&self.backend_root, &self.python, &self.home] {
            if !path.is_absolute() || path.components().any(|c| c == Component::ParentDir) {
                return Err("CONFIG_PATH_INVALID");
            }
        }
        if !self.backend_root.is_dir()
            || !self
                .backend_root
                .join("scripts/management_api.py")
                .is_file()
            || !self
                .backend_root
                .join("docs/management_api_v1.openapi.json")
                .is_file()
            || !self
                .backend_root
                .join("scripts/research_engine.py")
                .is_file()
        {
            return Err("BACKEND_UNAVAILABLE");
        }
        let root = self
            .backend_root
            .canonicalize()
            .map_err(|_| "BACKEND_UNAVAILABLE")?;
        let top = git(&root, &["rev-parse", "--show-toplevel"])?;
        if Path::new(&top)
            .canonicalize()
            .map_err(|_| "BACKEND_UNAVAILABLE")?
            != root
        {
            return Err("BACKEND_MISMATCH");
        }
        if git(&root, &["rev-parse", "HEAD"])? != BACKEND_SHA
            || !git(&root, &["status", "--porcelain", "--untracked-files=all"])?.is_empty()
        {
            return Err("BACKEND_MISMATCH");
        }
        let meta = self.python.metadata().map_err(|_| "PYTHON_UNAVAILABLE")?;
        if !meta.is_file() || meta.permissions().mode() & 0o111 == 0 {
            return Err("PYTHON_UNAVAILABLE");
        }
        let home_meta = self
            .home
            .symlink_metadata()
            .map_err(|_| "HOME_UNAVAILABLE")?;
        if !home_meta.is_dir()
            || home_meta.file_type().is_symlink()
            || home_meta.uid() != unsafe { libc::geteuid() }
            || home_meta.permissions().mode() & 0o077 != 0
        {
            return Err("HOME_UNSAFE");
        }
        Ok(())
    }
}

fn git(root: &Path, args: &[&str]) -> Result<String, &'static str> {
    let result = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|_| "BACKEND_UNAVAILABLE")?;
    if !result.status.success() || result.stdout.len() > 4096 {
        return Err("BACKEND_UNAVAILABLE");
    }
    String::from_utf8(result.stdout)
        .map(|s| s.trim().to_owned())
        .map_err(|_| "BACKEND_UNAVAILABLE")
}

pub(crate) fn child_owns_listener(port: u16, pid: u32) -> Result<bool, &'static str> {
    let table = fs::read_to_string("/proc/net/tcp").map_err(|_| "PORT_UNVERIFIABLE")?;
    let address = format!("0100007F:{port:04X}");
    for row in table.lines().skip(1) {
        let columns = row.split_whitespace().collect::<Vec<_>>();
        if columns.len() < 10 || columns[1] != address || columns[3] != "0A" {
            continue;
        }
        let socket = format!("socket:[{}]", columns[9]);
        let fds = fs::read_dir(format!("/proc/{pid}/fd")).map_err(|_| "PORT_UNVERIFIABLE")?;
        for fd in fds.flatten() {
            if fs::read_link(fd.path()).ok().as_deref() == Some(Path::new(&socket)) {
                return Ok(true);
            }
        }
        return Err("PORT_NOT_OWNED");
    }
    Ok(false)
}

struct Inner {
    phase: ManagementPhase,
    diagnostic: Option<&'static str>,
    child: Option<Child>,
    authority_dir: Option<AuthorityDir>,
    client: Option<ManagementClient>,
}

struct AuthorityDir {
    path: PathBuf,
    identity: (u64, u64),
    token_identity: Option<(u64, u64)>,
}

impl AuthorityDir {
    fn create(home: &Path) -> Result<Self, &'static str> {
        let mut bytes = [0_u8; 24];
        File::open("/dev/urandom")
            .and_then(|mut source| source.read_exact(&mut bytes))
            .map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        let name = format!(
            "management-authority-{}",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
        );
        let path = home.join(name);
        let mut builder = fs::DirBuilder::new();
        builder.mode(0o700);
        builder.create(&path).map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        let meta = fs::symlink_metadata(&path).map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        Ok(Self {
            path,
            identity: (meta.dev(), meta.ino()),
            token_identity: None,
        })
    }
    fn path(&self) -> &Path {
        &self.path
    }
    fn create_token(&mut self) -> Result<PathBuf, &'static str> {
        let token_path = self.path().join("token");
        let mut random = [0_u8; 48];
        File::open("/dev/urandom")
            .and_then(|mut source| source.read_exact(&mut random))
            .map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(random);
        let mut token_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(&token_path)
            .map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        let token_meta = token_file.metadata().map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        self.set_token_identity(&token_meta);
        token_file
            .write_all(token.as_bytes())
            .and_then(|_| token_file.sync_all())
            .map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        File::open(&self.path)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        Ok(token_path)
    }
    fn set_token_identity(&mut self, meta: &fs::Metadata) {
        self.token_identity = Some((meta.dev(), meta.ino()));
    }
    fn remove_owned_token(&mut self) -> Result<(), &'static str> {
        let path = self.path.join("token");
        if let Some(expected) = self.token_identity {
            let meta = fs::symlink_metadata(&path).map_err(|_| "AUTHORITY_UNAVAILABLE")?;
            if !meta.is_file() || (meta.dev(), meta.ino()) != expected {
                return Err("AUTHORITY_UNAVAILABLE");
            }
            fs::remove_file(path).map_err(|_| "AUTHORITY_UNAVAILABLE")?;
            self.token_identity = None;
        }
        Ok(())
    }
}

fn child_command(config: &SupervisorConfig, token_path: &Path, port: u16) -> Command {
    let mut command = Command::new(&config.python);
    command
        .arg("-m")
        .arg("scripts.management_api")
        .arg("--home")
        .arg(&config.home)
        .arg("--token-file")
        .arg(token_path)
        .arg("--port")
        .arg(port.to_string())
        .current_dir(&config.backend_root)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", &config.home)
        .env("LANG", "C.UTF-8")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        let parent = unsafe { libc::getpid() };
        unsafe {
            command.pre_exec(move || {
                if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0
                    || libc::getppid() != parent
                {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    command
}

impl Drop for AuthorityDir {
    fn drop(&mut self) {
        if fs::symlink_metadata(&self.path)
            .ok()
            .is_some_and(|meta| meta.is_dir() && (meta.dev(), meta.ino()) == self.identity)
        {
            let _ = self.remove_owned_token();
            let _ = fs::remove_dir(&self.path); // Never recursively remove unknown contents.
        }
    }
}

#[derive(Clone)]
pub struct ManagementSupervisor(Arc<Mutex<Inner>>);

impl ManagementSupervisor {
    /// Construct STARTING state and run a single bounded startup attempt off the UI thread.
    pub fn start(config: Result<SupervisorConfig, &'static str>) -> Self {
        let supervisor = Self(Arc::new(Mutex::new(Inner {
            phase: ManagementPhase::Starting,
            diagnostic: None,
            child: None,
            authority_dir: None,
            client: None,
        })));
        let worker = supervisor.clone();
        thread::spawn(move || {
            let result = config.and_then(|config| worker.start_once(config));
            match result {
                Ok(()) => loop {
                    match worker.status().state {
                        ManagementPhase::Ready => thread::sleep(Duration::from_millis(250)),
                        ManagementPhase::Failed => {
                            worker.stop_child(ManagementPhase::Failed);
                            break;
                        }
                        _ => break,
                    }
                },
                Err(code) => {
                    worker.stop_child(ManagementPhase::Failed);
                    let mut inner = worker.0.lock().expect("supervisor lock");
                    if inner.phase == ManagementPhase::Failed {
                        inner.diagnostic = Some(code);
                    }
                }
            }
        });
        supervisor
    }

    pub fn status(&self) -> ManagementRuntimeStatus {
        let mut inner = self.0.lock().expect("supervisor lock");
        if inner.phase == ManagementPhase::Ready
            && inner
                .child
                .as_mut()
                .and_then(|child| child.try_wait().ok())
                .flatten()
                .is_some()
        {
            inner.phase = ManagementPhase::Failed;
            inner.diagnostic = Some("CHILD_EXITED");
            inner.client = None;
        }
        ManagementRuntimeStatus {
            state: inner.phase,
            diagnostic: inner.diagnostic,
        }
    }

    pub fn client(&self) -> Result<ManagementClient, NativeError> {
        let inner = self.0.lock().expect("supervisor lock");
        if inner.phase != ManagementPhase::Ready {
            return Err(NativeError::new(
                "MANAGEMENT_UNAVAILABLE",
                "Gestion locale indisponible.",
            ));
        }
        inner.client.clone().ok_or_else(|| {
            NativeError::new("MANAGEMENT_UNAVAILABLE", "Gestion locale indisponible.")
        })
    }

    /// Native-only process identity for bounded integration verification.
    pub fn child_pid(&self) -> Option<u32> {
        self.0
            .lock()
            .expect("supervisor lock")
            .child
            .as_ref()
            .map(Child::id)
    }

    fn start_once(&self, config: SupervisorConfig) -> Result<(), &'static str> {
        config.validate()?;
        let mut authority = AuthorityDir::create(&config.home)?;
        let token_path = authority.create_token()?;
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|_| "PORT_UNAVAILABLE")?;
        let port = listener
            .local_addr()
            .map_err(|_| "PORT_UNAVAILABLE")?
            .port();
        drop(listener); // Existing launcher accepts a port, not an inherited bound socket.
        let client =
            ManagementClient::new(port, &token_path).map_err(|_| "AUTHORITY_UNAVAILABLE")?;
        let mut command = child_command(&config, &token_path, port);
        let mut inner = self.0.lock().expect("supervisor lock");
        if inner.phase != ManagementPhase::Starting {
            return Err("STARTUP_CANCELLED");
        }
        let mut child = command.spawn().map_err(|_| "CHILD_SPAWN_FAILED")?;
        drain(child.stdout.take());
        drain(child.stderr.take());
        inner.child = Some(child);
        inner.authority_dir = Some(authority);
        drop(inner);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|_| "STARTUP_FAILED")?;
        let started = Instant::now();
        loop {
            {
                let mut inner = self.0.lock().expect("supervisor lock");
                if inner.phase != ManagementPhase::Starting {
                    return Err("STARTUP_CANCELLED");
                }
                if inner
                    .child
                    .as_mut()
                    .ok_or("CHILD_EXITED")?
                    .try_wait()
                    .map_err(|_| "CHILD_EXITED")?
                    .is_some()
                {
                    return Err("CHILD_EXITED");
                }
            }
            if started.elapsed() >= STARTUP_LIMIT {
                return Err("STARTUP_TIMEOUT");
            }
            let pid = self
                .0
                .lock()
                .expect("supervisor lock")
                .child
                .as_ref()
                .ok_or("CHILD_EXITED")?
                .id();
            if !child_owns_listener(port, pid)? {
                thread::sleep(Duration::from_millis(100));
                continue;
            }
            let response = runtime.block_on(client.management_status());
            if response
                .as_ref()
                .is_err_and(|error| error.kind == "INCOMPATIBLE_RESPONSE")
            {
                return Err("API_VERSION_MISMATCH");
            }
            if let Ok(status) = response {
                let mut inner = self.0.lock().expect("supervisor lock");
                if inner.phase != ManagementPhase::Starting {
                    return Err("STARTUP_CANCELLED");
                }
                if inner
                    .child
                    .as_mut()
                    .ok_or("CHILD_EXITED")?
                    .try_wait()
                    .map_err(|_| "CHILD_EXITED")?
                    .is_some()
                {
                    return Err("CHILD_EXITED");
                }
                if status.management_available {
                    // The child has read the file by this point. Retain only the in-memory client.
                    // Do not reuse a reqwest pool first exercised on this short-lived startup runtime.
                    let steady_client = ManagementClient::new(port, &token_path)
                        .map_err(|_| "AUTHORITY_UNAVAILABLE")?;
                    inner
                        .authority_dir
                        .as_mut()
                        .ok_or("AUTHORITY_UNAVAILABLE")?
                        .remove_owned_token()?;
                    inner.client = Some(steady_client);
                    inner.phase = ManagementPhase::Ready;
                    return Ok(());
                }
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn stop_child(&self, final_phase: ManagementPhase) {
        let (mut child, authority) = {
            let mut inner = self.0.lock().expect("supervisor lock");
            if inner.phase == ManagementPhase::Stopped {
                return;
            }
            inner.phase = ManagementPhase::Stopping;
            inner.client = None;
            (inner.child.take(), inner.authority_dir.take())
        };
        if let Some(ref mut child) = child {
            #[cfg(target_os = "linux")]
            unsafe {
                libc::kill(child.id() as i32, libc::SIGTERM);
            }
            let deadline = Instant::now() + STOP_GRACE;
            while Instant::now() < deadline {
                if child.try_wait().ok().flatten().is_some() {
                    break;
                }
                thread::sleep(Duration::from_millis(50));
            }
            if child.try_wait().ok().flatten().is_none() {
                let _ = child.kill();
            }
            let _ = child.wait();
        }
        drop(authority);
        self.0.lock().expect("supervisor lock").phase = final_phase;
    }

    /// Terminate and reap only the owned child; release only this instance's authority directory.
    pub fn stop(&self) {
        self.stop_child(ManagementPhase::Stopped);
    }
}

pub(crate) fn drain<R: Read + Send + 'static>(pipe: Option<R>) {
    if let Some(mut pipe) = pipe {
        thread::spawn(move || {
            let mut buffer = [0_u8; 1024];
            let mut captured = Vec::with_capacity(4096);
            loop {
                match pipe.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(n) if captured.len() < 4096 => {
                        captured.extend_from_slice(&buffer[..n.min(4096 - captured.len())]);
                    }
                    Ok(_) => {}
                }
            }
            // Raw child output is intentionally never serialized or logged.
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn private_home() -> TempHome {
        let dir = tempfile::Builder::new()
            .prefix("supervisor-unit-")
            .tempdir()
            .unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
        TempHome(dir)
    }
    struct TempHome(tempfile::TempDir);
    impl TempHome {
        fn path(&self) -> &Path {
            self.0.path()
        }
    }

    #[test]
    fn authority_is_private_exclusive_and_own_cleanup_only() {
        let home = private_home();
        let mut authority = AuthorityDir::create(home.path()).unwrap();
        assert_eq!(
            fs::symlink_metadata(authority.path())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        let token_path = authority.create_token().unwrap();
        assert_eq!(
            fs::symlink_metadata(&token_path)
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        let token = crate::read_private_token(&token_path).unwrap();
        assert!(token.len() >= 43);
        assert_eq!(
            authority.create_token().unwrap_err(),
            "AUTHORITY_UNAVAILABLE"
        );
        let owned_path = authority.path().to_path_buf();
        drop(authority);
        assert!(!owned_path.exists());
    }

    #[test]
    fn child_command_contains_only_path_and_minimal_environment() {
        let home = private_home();
        let mut authority = AuthorityDir::create(home.path()).unwrap();
        let token_path = authority.create_token().unwrap();
        let token = crate::read_private_token(&token_path).unwrap();
        let config = SupervisorConfig {
            backend_root: home.path().into(),
            python: PathBuf::from("/usr/bin/python3"),
            home: home.path().into(),
        };
        let command = child_command(&config, &token_path, 38123);
        let args = command
            .get_args()
            .map(|value| value.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert!(args
            .iter()
            .any(|value| value == &token_path.to_string_lossy()));
        assert!(!args.iter().any(|value| value.contains(&token)));
        let names = command
            .get_envs()
            .map(|(key, _)| key.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert_eq!(names, ["HOME", "LANG", "PATH", "PYTHONDONTWRITEBYTECODE"]);
        assert!(!names.iter().any(|name| name.contains("TOKEN")
            || name.contains("API_KEY")
            || name.contains("POSTGRES")));
    }

    #[test]
    fn wrong_checkout_is_rejected_before_spawn() {
        let root = private_home();
        fs::create_dir(root.path().join("scripts")).unwrap();
        fs::create_dir(root.path().join("docs")).unwrap();
        fs::write(
            root.path().join("scripts/management_api.py"),
            b"# fixture\n",
        )
        .unwrap();
        fs::write(
            root.path().join("scripts/research_engine.py"),
            b"# fixture\n",
        )
        .unwrap();
        fs::write(
            root.path().join("docs/management_api_v1.openapi.json"),
            b"{}\n",
        )
        .unwrap();
        for args in [
            vec!["init", "-q"],
            vec!["add", "."],
            vec![
                "-c",
                "user.name=fixture",
                "-c",
                "user.email=fixture@invalid",
                "commit",
                "-qm",
                "fixture",
            ],
        ] {
            assert!(Command::new("git")
                .args(args)
                .current_dir(root.path())
                .status()
                .unwrap()
                .success());
        }
        let config = SupervisorConfig {
            backend_root: root.path().into(),
            python: PathBuf::from("/usr/bin/python3"),
            home: root.path().into(),
        };
        assert_eq!(config.validate().unwrap_err(), "BACKEND_MISMATCH");
        let supervisor = ManagementSupervisor::start(Ok(config));
        for _ in 0..100 {
            if supervisor.status().state != ManagementPhase::Starting {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(supervisor.status().state, ManagementPhase::Failed);
        assert!(supervisor.child_pid().is_none());
    }

    #[test]
    fn missing_configuration_fails_without_client_or_token_in_error() {
        let supervisor = ManagementSupervisor::start(Err("CONFIG_MISSING"));
        for _ in 0..100 {
            if supervisor.status().state != ManagementPhase::Starting {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(supervisor.status().state, ManagementPhase::Failed);
        let error = supervisor.client().err().unwrap();
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("MANAGEMENT_UNAVAILABLE"));
        assert!(!json.contains("CONFIG_MISSING"));
        assert!(supervisor.child_pid().is_none());
    }

    fn with_child(child: Child) -> ManagementSupervisor {
        ManagementSupervisor(Arc::new(Mutex::new(Inner {
            phase: ManagementPhase::Ready,
            diagnostic: None,
            child: Some(child),
            authority_dir: None,
            client: None,
        })))
    }

    #[test]
    fn early_exit_is_failed_and_exact_child_is_reaped() {
        let child = Command::new("/usr/bin/true").spawn().unwrap();
        let pid = child.id();
        let supervisor = with_child(child);
        thread::sleep(Duration::from_millis(50));
        assert_eq!(supervisor.status().state, ManagementPhase::Failed);
        supervisor.stop();
        assert!(!PathBuf::from(format!("/proc/{pid}")).exists());
    }

    #[test]
    fn stop_only_reaps_its_owned_child() {
        let child = Command::new("/usr/bin/sleep").arg("30").spawn().unwrap();
        let mut unrelated = Command::new("/usr/bin/sleep").arg("30").spawn().unwrap();
        let pid = child.id();
        let supervisor = with_child(child);
        supervisor.stop();
        assert_eq!(supervisor.status().state, ManagementPhase::Stopped);
        assert!(!PathBuf::from(format!("/proc/{pid}")).exists());
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.kill().unwrap();
        unrelated.wait().unwrap();
    }

    #[test]
    fn occupied_port_never_qualifies_as_owned_listener() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut unrelated = Command::new("/usr/bin/sleep").arg("30").spawn().unwrap();
        assert_eq!(
            child_owns_listener(port, unrelated.id()).unwrap_err(),
            "PORT_NOT_OWNED"
        );
        unrelated.kill().unwrap();
        unrelated.wait().unwrap();
    }
}
