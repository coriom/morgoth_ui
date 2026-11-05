fn main() -> std::process::ExitCode {
    if std::env::args().nth(1).as_deref() == Some("--d12-mcp-fixture") {
        morgoth_desktop::connector_gateway::fixture_stdio_main();
        return std::process::ExitCode::SUCCESS;
    }
    morgoth_desktop::run()
}
