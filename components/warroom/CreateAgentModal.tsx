"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AgentType, CreateAgentPayload } from "@/types/morgoth";

export function CreateAgentModal({
  availableTools,
  onCreate,
  pending,
}: {
  availableTools: string[];
  onCreate: (payload: CreateAgentPayload) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [task, setTask] = useState("");
  const [model, setModel] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("ephemeral");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const tools = useMemo(() => Array.from(new Set(availableTools)).sort(), [availableTools]);

  function toggleTool(tool: string) {
    setSelectedTools((current) =>
      current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool],
    );
  }

  function handleSubmit() {
    if (!name.trim() || !task.trim()) {
      return;
    }

    onCreate({
      name: name.trim(),
      task: task.trim(),
      agent_type: agentType,
      model: model.trim() || undefined,
      tools: selectedTools,
    });
    setOpen(false);
    setName("");
    setTask("");
    setModel("");
    setSelectedTools([]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Agent</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
          <DialogDescription>Provision a new mission without hardcoded tool assumptions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Name</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="observer-01" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Agent Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["ephemeral", "persistent"] as AgentType[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={agentType === value ? "default" : "secondary"}
                  onClick={() => setAgentType(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Model</label>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Leave blank to use the backend default"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Mission</label>
            <textarea
              value={task}
              onChange={(event) => setTask(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary outline-none ring-0 transition focus:border-primary"
              placeholder="Describe the mission for this agent..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Available Tools</label>
            {tools.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
                No tool names are visible in current agent state yet. You can still create an agent without selecting tools.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tools.map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleTool(tool)}
                    className={`rounded-full border px-3 py-2 font-mono text-xs transition ${
                      selectedTools.includes(tool)
                        ? "border-primary bg-primaryGlow text-textPrimary"
                        : "border-border bg-surface2 text-textSecondary"
                    }`}
                  >
                    {tool}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button className="w-full" disabled={pending} onClick={handleSubmit}>
            {pending ? "Creating..." : "Create Agent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
