//! Disposable native proof: persisted Markdown -> authenticated Management -> Rust.
use morgoth_desktop::supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig};
use std::{
    thread,
    time::{Duration, Instant},
};

fn main() {
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
    let client = supervisor.client().expect("native token authority");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let a = client
            .list_knowledge_reads("project_a", 0, "")
            .await
            .expect("A vault");
        let b = client
            .list_knowledge_reads("project_b", 0, "")
            .await
            .expect("B vault");
        assert_eq!(a.documents.len(), 2);
        assert!(b.documents.is_empty());
        let index = a
            .documents
            .iter()
            .find(|d| d.title == "Index synthétique")
            .expect("index");
        let topic = a
            .documents
            .iter()
            .find(|d| d.title == "Procédure synthétique")
            .expect("topic");
        assert_eq!(
            index.links[0].target_id.as_deref(),
            Some(topic.document_id.as_str())
        );
        assert!(index.links[1].target_id.is_none());
        let detail = client
            .get_knowledge_read("project_a", &index.document_id)
            .await
            .expect("detail");
        assert!(detail
            .content
            .as_deref()
            .unwrap_or("")
            .contains("[[topic|Procédure]]"));
        assert_eq!(
            client
                .get_knowledge_read("project_b", &index.document_id)
                .await
                .unwrap_err()
                .status,
            Some(404)
        );
        assert_eq!(
            client
                .list_knowledge_reads("project_a", 0, "persistée")
                .await
                .unwrap()
                .documents
                .len(),
            1
        );
    });
    supervisor.stop();
    assert_eq!(supervisor.status().state, ManagementPhase::Stopped);
    println!("D6_NATIVE_KNOWLEDGE_PASS=true CROSS_PROJECT_404=true EMPTY_PROJECT_B=true NO_INFERENCE=true");
}
