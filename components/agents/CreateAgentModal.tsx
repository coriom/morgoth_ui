"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import type { AgentType, CreateAgentPayload } from "@/types/morgoth";

const TOOL_OPTIONS = ["web", "shell", "market", "files", "notifications"];

export function CreateAgentModal({
  onCreate,
  pending,
}: {
  onCreate: (payload: CreateAgentPayload) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("ephemeral");
  const [model, setModel] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [tools, setTools] = useState<string[]>(["shell"]);

  function toggleTool(tool: string) {
    setTools((current) => (current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool]));
  }

  function handleSubmit() {
    if (!name.trim() || !taskDescription.trim()) {
      return;
    }

    onCreate({
      name: name.trim(),
      agent_type: agentType,
      model: model.trim() || undefined,
      task: taskDescription.trim(),
      tools,
    });
    setOpen(false);
    setName("");
    setModel("");
    setTaskDescription("");
    setTools(["shell"]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Agent</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
          <DialogDescription>Provision an ephemeral or persistent agent with a task and tool scope.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Agent Name</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="ops-scout-01" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Type</label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface2 p-1">
              {(["ephemeral", "persistent"] as AgentType[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAgentType(value)}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm text-textSecondary transition",
                    agentType === value && "bg-primary text-textPrimary shadow-glow",
                  )}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Model</label>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Leave blank to use the backend default agent model"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Task Description</label>
            <textarea
              value={taskDescription}
              onChange={(event) => setTaskDescription(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Describe the mission for this agent..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Tools</label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {TOOL_OPTIONS.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className={cn(
                    "rounded-lg border border-border bg-surface2 px-3 py-2 text-left text-sm text-textSecondary transition",
                    tools.includes(tool) && "border-primary bg-primaryGlow text-textPrimary",
                  )}
                >
                  {tool}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={pending}>
            {pending ? "Creating..." : "Create Agent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
