fn main() {
    if std::env::args().nth(1).as_deref() == Some("--d12-mcp-fixture") {
        morgoth_desktop::connector_gateway::fixture_stdio_main();
        return;
    }
    morgoth_desktop::run();
}
