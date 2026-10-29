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
    const transport: ConnectorTransport = { catalog: async () => { throw Error("secret"); }, connect: vi.fn(), test: vi.fn(), disconnect: vi.fn() };
    render(<ConnectionsWorkspace transport={transport} />);
    expect((await screen.findByRole("alert")).textContent).not.toContain("secret");
    expect(screen.queryByRole("button",{name:"Tester la lecture"})).toBeNull();
  });
});
