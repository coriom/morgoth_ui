//! Disposable native proof for Management creation and local persistence.
use morgoth_desktop::{
    drafts::{DraftInput, DraftStore},
    notes::{NoteInput, NoteStore},
    supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig},
    CreateProjectRequest,
};
use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};

fn ready() -> ManagementSupervisor {
    let supervisor = ManagementSupervisor::start(Ok(
        SupervisorConfig::from_environment().expect("fixture configuration")
    ));
    let deadline = Instant::now() + Duration::from_secs(20);
    while supervisor.status().state == ManagementPhase::Starting && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(
        supervisor.status().state,
        ManagementPhase::Ready,
        "{:?}",
        supervisor.status().diagnostic
    );
    supervisor
}

fn main() {
    let local = PathBuf::from(std::env::var("D7_SMOKE_DATA_ROOT").expect("fixture data root"));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let supervisor = ready();
    let client = supervisor.client().expect("native authority");
    runtime.block_on(async {
        assert!(!client
            .list_projects()
            .await
            .unwrap()
            .projects
            .iter()
            .any(|p| !p.legacy));
        assert!(client
            .list_domains()
            .await
            .unwrap()
            .domains
            .iter()
            .any(|d| d.id == "crypto" && d.configuration_valid));
        let input = CreateProjectRequest {
            id: "personal".into(),
            name: "Personnel synthétique".into(),
            domain: "crypto".into(),
        };
        let created = client
            .create_project(&input)
            .await
            .expect("authenticated create");
        assert!(
            created.created
                && created.durability_confirmed
                && !created.engine_started
                && !created.storage_initialized
        );
        assert_eq!(created.project.id, "personal");
        assert_eq!(
            client
                .list_projects()
                .await
                .unwrap()
                .projects
                .iter()
                .filter(|p| !p.legacy)
                .count(),
            1
        );
        assert!(client
            .list_knowledge_reads("personal", 0, "")
            .await
            .unwrap()
            .documents
            .is_empty());
        assert_eq!(
            client
                .create_project(&input)
                .await
                .unwrap_err()
                .code
                .as_deref(),
            Some("ALREADY_EXISTS")
        );
    });
    supervisor.stop();
    let supervisor = ready();
    runtime.block_on(async {
        assert_eq!(
            supervisor
                .client()
                .unwrap()
                .list_projects()
                .await
                .unwrap()
                .projects
                .iter()
                .filter(|p| !p.legacy)
                .count(),
            1
        );
    });
    supervisor.stop();

    let draft_store = DraftStore::new(local.join("mission-workspace-v1"));
    let note_store = NoteStore::new(local.join("knowledge-v1"));
    let draft = draft_store
        .create(DraftInput {
            project_id: "personal".into(),
            title: "Mission synthétique".into(),
            objective: "Préparer un travail local".into(),
            verification_criteria: "Contrôle humain".into(),
        })
        .unwrap();
    let first = note_store
        .create(NoteInput {
            project_id: "personal".into(),
            title: "Alpha".into(),
            collection: "Personnel".into(),
            markdown: "Voir [[Beta]].".into(),
        })
        .unwrap();
    let second = note_store
        .create(NoteInput {
            project_id: "personal".into(),
            title: "Beta".into(),
            collection: "Personnel".into(),
            markdown: "Source synthétique.".into(),
        })
        .unwrap();
    let reopened_drafts = DraftStore::new(local.join("mission-workspace-v1"));
    let reopened_notes = NoteStore::new(local.join("knowledge-v1"));
    assert_eq!(
        reopened_drafts
            .get("personal", &draft.draft_id)
            .unwrap()
            .objective,
        "Préparer un travail local"
    );
    assert_eq!(reopened_notes.list("personal").unwrap().len(), 2);
    assert_eq!(
        reopened_notes
            .get("personal", &first.note_id)
            .unwrap()
            .markdown,
        "Voir [[Beta]]."
    );
    assert_eq!(
        reopened_notes
            .get("personal", &second.note_id)
            .unwrap()
            .title,
        "Beta"
    );
    let exported = reopened_notes
        .export_markdown("personal", &first.note_id, &local.join("note-exports-v1"))
        .unwrap();
    assert_eq!(std::fs::read_to_string(exported).unwrap(), "Voir [[Beta]].");
    assert!(reopened_drafts.list("other").unwrap().is_empty());
    assert!(reopened_notes.list("other").unwrap().is_empty());
    println!("D7_NATIVE_PERSISTENCE_PASS=true PROJECT_CREATED=true ENGINE_STARTED=false PERSONAL_RECORDS_REOPENED=true CROSS_PROJECT_EMPTY=true NO_INFERENCE=true");
}
