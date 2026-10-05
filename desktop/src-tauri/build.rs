fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "management_runtime_status",
            "management_status",
            "list_domains",
            "list_projects",
            "get_project",
            "validate_project",
            "create_project",
        ]),
    ))
    .expect("Tauri capability build failed");
}
