import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConnectionsWorkspace, type ConnectorTransport, type ConnectorView } from "./ConnectionsWorkspace";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const fixture = (status: ConnectorView["status"]): ConnectorView => ({
  id: "local-mcp-fixture", name: "MCP local de démonstration", kind: "mcp-stdio",
  target: "Serveur synthétique intégré", operation: "read_snapshot", scope: "Données de test fixes ; lecture seule",
  risk: "LOW_READ_ONLY", permission: "INSPECT_SYNTHETIC_FIXTURE", status,
  expires_in_seconds: status === "AUTHORIZED" ? 600 : null, last_verified_ms: null,
});
describe("fixed local connector hub", () => {
  it("does not connect on discovery and revokes an approved session", async () => {
    let status: ConnectorView["status"] = "DISCONNECTED";
    const transport: ConnectorTransport = {
      catalog: vi.fn(async () => [fixture(status)]),
      connect: vi.fn(async consent => { expect(consent).toBe("CONNECT LOCAL FIXTURE"); status="AUTHORIZED"; }),
      test: vi.fn(async () => ({ connector_id:"local-mcp-fixture", operation:"read_snapshot", status:"SUCCEEDED", fixture_items:2 })),
      disconnect: vi.fn(async () => { status="DISCONNECTED"; }),
      windowsDetect: vi.fn(), windowsAuthorize: vi.fn(), windowsInspect: vi.fn(), windowsInvoke: vi.fn(), windowsDisconnect: vi.fn(),
    };
    render(<ConnectionsWorkspace transport={transport} />);
    expect(transport.connect).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button",{name:"Autoriser ce test local"}));
    await waitFor(() => expect(screen.getByRole("button",{name:"Tester la lecture"})).toBeTruthy());
    fireEvent.click(screen.getByRole("button",{name:"Tester la lecture"}));
    expect(await screen.findByText(/2 éléments synthétiques/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Déconnecter"}));
    await waitFor(() => expect(screen.getByRole("button",{name:"Autoriser ce test local"})).toBeTruthy());
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
  });
  it("does not claim availability after a catalog error", async () => {
    const transport: ConnectorTransport = { catalog: async () => { throw Error("secret"); }, connect: vi.fn(), test: vi.fn(), disconnect: vi.fn(),
      windowsDetect: vi.fn(), windowsAuthorize: vi.fn(), windowsInspect: vi.fn(), windowsInvoke: vi.fn(), windowsDisconnect: vi.fn() };
    render(<ConnectionsWorkspace transport={transport} />);
    expect((await screen.findByRole("alert")).textContent).not.toContain("secret");
    expect(screen.queryByRole("button",{name:"Tester la lecture"})).toBeNull();
  });
  it("never inspects or invokes Windows before separate native-consent calls", async () => {
    let status: ConnectorView["status"] = "AVAILABLE";
    const windows = (): ConnectorView => ({ ...fixture(status), id:"windows-uia", name:"Application Windows de test", status });
    const transport: ConnectorTransport = {
      catalog: vi.fn(async () => [windows()]), connect: vi.fn(), test: vi.fn(), disconnect: vi.fn(),
      windowsDetect: vi.fn(async () => { status="DISCOVERED"; return {app:"Morgoth D13 Test Target",process_id:"10",session_id:"1",operation:"toggle_test_state"}; }),
      windowsAuthorize: vi.fn(async () => { status="AUTHORIZED"; }),
      windowsInspect: vi.fn(async () => ({ state:"INACTIVE" as const, controls:[] })),
      windowsInvoke: vi.fn(async () => ({ action:"toggle_test_state" as const,before:"INACTIVE" as const,after:"ACTIVE" as const,verified:true })),
      windowsDisconnect: vi.fn(async () => { status="REVOKED"; }),
    };
    render(<ConnectionsWorkspace transport={transport} />);
    expect(transport.windowsInspect).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button",{name:"Détecter la fenêtre test"}));
    await waitFor(() => expect(screen.getByRole("button",{name:"Autoriser l’inspection"})).toBeTruthy());
    expect(transport.windowsInspect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Autoriser l’inspection"}));
    await waitFor(() => expect(transport.windowsInspect).toHaveBeenCalledTimes(1));
    expect(transport.windowsInvoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Basculer l’état test…"}));
    await waitFor(() => expect(transport.windowsInvoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button",{name:"Déconnecter Windows"}));
    await waitFor(() => expect(screen.getByRole("button",{name:"Détecter la fenêtre test"})).toBeTruthy());
  });
  it("shows only a fixed Windows failure message, never native exception text", async () => {
    const windows = { ...fixture("AVAILABLE"), id:"windows-uia" };
    const transport: ConnectorTransport = {
      catalog: async () => [windows], connect: vi.fn(), test: vi.fn(), disconnect: vi.fn(),
      windowsDetect: vi.fn(async () => { throw { kind:"WINDOWS_TIMEOUT", message:"private window title" }; }),
      windowsAuthorize: vi.fn(), windowsInspect: vi.fn(), windowsInvoke: vi.fn(), windowsDisconnect: vi.fn(),
    };
    render(<ConnectionsWorkspace transport={transport} />);
    fireEvent.click(await screen.findByRole("button",{name:"Détecter la fenêtre test"}));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("délai prévu");
    expect(alert.textContent).not.toContain("private window title");
  });
  it("keeps the real browser session separate from discovery and exposes only fixed fixture actions", async () => {
    let status: ConnectorView["status"] = "AVAILABLE";
    const browser = (): ConnectorView => ({ ...fixture(status), id:"browser-test", name:"Navigateur isolé", status });
    const page = { url:"http://127.0.0.1:12345/", origin:"http://127.0.0.1:12345", title:"Atelier D14", text:"En attente", state:"En attente", headings:["Atelier navigateur"], elements:[{ref:"E1-1",kind:"textbox",name:"Code synthétique"}] };
    const transport: ConnectorTransport = {
      catalog: vi.fn(async () => [browser()]), connect: vi.fn(), test: vi.fn(), disconnect: vi.fn(),
      windowsDetect: vi.fn(), windowsAuthorize: vi.fn(), windowsInspect: vi.fn(), windowsInvoke: vi.fn(), windowsDisconnect: vi.fn(),
      browserStart: vi.fn(async () => { status="AUTHORIZED"; return { status, origin:page.origin, url:page.url, expires_in_seconds:600 }; }),
      browserInspect: vi.fn(async () => page), browserNavigate: vi.fn(), browserFill: vi.fn(async () => page), browserClick: vi.fn(),
      browserDisconnect: vi.fn(async () => { status="REVOKED"; }),
    };
    render(<ConnectionsWorkspace transport={transport} />);
    expect(transport.browserStart).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", {name:"Ouvrir une session de test…"}));
    expect(await screen.findByText("Atelier D14")).toBeTruthy();
    expect(transport.browserStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", {name:"Saisir le code test…"}));
    await waitFor(() => expect(transport.browserFill).toHaveBeenCalledWith("E1-1"));
    fireEvent.click(screen.getByRole("button", {name:"Déconnecter le navigateur"}));
    await waitFor(() => expect(screen.getByRole("button", {name:"Ouvrir une session de test…"})).toBeTruthy());
    expect(transport.browserDisconnect).toHaveBeenCalledTimes(1);
  });
});
