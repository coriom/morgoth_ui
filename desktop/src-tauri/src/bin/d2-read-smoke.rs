//! Bounded development-only native transport proof against an owned morgoth_test fixture.
use morgoth_desktop::supervisor::{ManagementPhase, ManagementSupervisor, SupervisorConfig};
use std::{
    thread,
    time::{Duration, Instant},
};

fn main() {
    let config = SupervisorConfig::from_environment().expect("native test configuration");
    let supervisor = ManagementSupervisor::start(Ok(config));
    let deadline = Instant::now() + Duration::from_secs(20);
    while supervisor.status().state == ManagementPhase::Starting && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(
        supervisor.status().state,
        ManagementPhase::Ready,
        "Management not ready"
    );
    let client = supervisor.client().expect("authenticated native client");
    let mission_id = std::env::var("MORGOTH_D2_TEST_MISSION_ID").expect("test mission ID");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let a = client
            .list_mission_reads("project_a", 0)
            .await
            .expect("Project A missions");
        let b = client
            .list_mission_reads("project_b", 0)
            .await
            .expect("Project B missions");
        assert_eq!(a.missions.len(), 1);
        assert!(b.missions.is_empty());
        assert_eq!(a.missions[0].mission_id, mission_id);
        assert_eq!(
            client
                .get_mission_read("project_a", &mission_id)
                .await
                .unwrap()
                .project_id,
            "project_a"
        );
        let foreign = client
            .get_mission_read("project_b", &mission_id)
            .await
            .unwrap_err();
        assert_eq!(foreign.status, Some(404));
        let caps = client
            .list_capability_reads("project_a", 0)
            .await
            .expect("Project A capabilities");
        assert_eq!(caps.capabilities.len(), 1);
        assert_eq!(caps.capabilities[0].approval_kind, "NONE_RECORDED");
        assert!(client
            .list_capability_reads("project_b", 0)
            .await
            .unwrap()
            .capabilities
            .is_empty());
    });
    supervisor.stop();
    assert_eq!(supervisor.status().state, ManagementPhase::Stopped);
    println!("D2_NATIVE_PROJECT_READ_PASS=TRUE PROJECT_A_MISSIONS=1 PROJECT_B_MISSIONS=0 CAPABILITY_APPROVAL=NONE_RECORDED CROSS_PROJECT_404=TRUE");
}
