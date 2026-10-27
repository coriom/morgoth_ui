//! Disposable native transport proof: PostgreSQL -> Management -> Rust.
use morgoth_desktop::supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig};
use std::{
    thread,
    time::{Duration, Instant},
};

fn main() {
    let supervisor = ManagementSupervisor::start(Ok(
        SupervisorConfig::from_environment().expect("fixture configuration")
    ));
    let deadline = Instant::now() + Duration::from_secs(25);
    while supervisor.status().state == ManagementPhase::Starting && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(
        supervisor.status().state,
        ManagementPhase::Ready,
        "{:?}",
        supervisor.status().diagnostic
    );
    let client = supervisor.client().expect("native Management authority");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let theses = client
            .list_structured_theses("alpha", 0, "", "", "")
            .await
            .expect("alpha thesis list");
        assert_eq!(theses.theses.len(), 2);
        assert_eq!(theses.source, "PROJECT_STRUCTURED_POSTGRESQL");
        let thesis = client
            .get_structured_thesis("alpha", &theses.theses[0].thesis_id)
            .await
            .expect("alpha thesis detail");
        assert_eq!(thesis.project_id, "alpha");
        let contradictions = client
            .list_structured_contradictions("alpha", 0)
            .await
            .expect("alpha contradictions");
        assert_eq!(contradictions.contradictions.len(), 1);
        let relation = client
            .get_structured_contradiction(
                "alpha",
                &contradictions.contradictions[0].contradiction_id,
            )
            .await
            .expect("contradiction detail");
        assert_eq!(relation.project_id, "alpha");
        assert_eq!(
            client
                .list_structured_theses("beta", 0, "", "", "")
                .await
                .unwrap_err()
                .status,
            Some(503)
        );
        assert_eq!(
            client
                .get_structured_thesis("beta", &thesis.thesis_id)
                .await
                .unwrap_err()
                .status,
            Some(503)
        );
        assert!(client
            .list_structured_theses("../alpha", 0, "", "", "")
            .await
            .is_err());
    });
    supervisor.stop();
    assert_eq!(supervisor.status().state, ManagementPhase::Stopped);
    println!("D9_NATIVE_MEMORY_PASS=true CROSS_PROJECT_DENIED=true NO_INFERENCE=true");
}
