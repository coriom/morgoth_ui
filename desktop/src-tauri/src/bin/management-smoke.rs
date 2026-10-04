//! Guarded local integration client; never uses a production catalog.
use morgoth_desktop::{CreateProjectRequest, ManagementClient};

#[tokio::main]
async fn main() {
    let client =
        ManagementClient::from_environment().expect("synthetic smoke configuration failed");
    assert!(
        client
            .management_status()
            .await
            .expect("status failed")
            .management_available
    );
    let wrong_file = std::env::var_os("MORGOTH_DESKTOP_WRONG_TOKEN_FILE")
        .expect("synthetic wrong token file missing");
    let port: u16 = std::env::var("MORGOTH_DESKTOP_MANAGEMENT_PORT")
        .unwrap()
        .parse()
        .unwrap();
    let wrong_client = ManagementClient::new(port, std::path::Path::new(&wrong_file)).unwrap();
    let unauthorized = wrong_client
        .management_status()
        .await
        .expect_err("wrong token accepted");
    assert_eq!(unauthorized.status, Some(401));
    let domains = client.list_domains().await.expect("domain list failed");
    assert!(domains
        .domains
        .iter()
        .any(|d| d.id == "crypto" && d.configuration_valid));
    let before = client
        .list_projects()
        .await
        .expect("initial project list failed");
    assert!(before.projects.iter().all(|p| p.legacy));
    for id in ["research_a", "research_b"] {
        let input = CreateProjectRequest {
            id: id.into(),
            name: format!("Synthetic {id}"),
            domain: "crypto".into(),
        };
        let created = client.create_project(&input).await.expect("create failed");
        assert!(created.created && !created.engine_started && !created.storage_initialized);
        assert_eq!(client.get_project(id).await.expect("get failed").id, id);
        assert!(
            client
                .validate_project(id)
                .await
                .expect("validation failed")
                .configuration_valid
        );
    }
    let after = client
        .list_projects()
        .await
        .expect("final project list failed");
    assert_eq!(after.projects.len(), before.projects.len() + 2);
    let a = after
        .projects
        .iter()
        .find(|p| p.id == "research_a")
        .unwrap();
    let b = after
        .projects
        .iter()
        .find(|p| p.id == "research_b")
        .unwrap();
    assert_ne!(a.postgres_schema, b.postgres_schema);
    assert_ne!(a.chroma_prefix, b.chroma_prefix);
    assert_ne!(a.vault_dir, b.vault_dir);
    let duplicate = client
        .create_project(&CreateProjectRequest {
            id: "research_a".into(),
            name: "Duplicate".into(),
            domain: "crypto".into(),
        })
        .await
        .expect_err("duplicate create must conflict");
    assert_eq!(duplicate.code.as_deref(), Some("ALREADY_EXISTS"));
    assert_eq!(duplicate.status, Some(409));
    println!("real Rust→HTTP→ProjectManager: status/domains/list/create×2/get/validate/conflict PASS; isolated namespaces PASS");
}
