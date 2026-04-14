"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { Permissions, PermissionsResponse } from "@/types/morgoth";
const GROUPS: Array<{ title: string; keys: Array<keyof Permissions> }> = [
  {
    title: "Agents",
    keys: ["can_create_ephemeral_agents", "can_create_persistent_agents"],
  },
  {
    title: "Code",
    keys: ["can_self_modify", "can_execute_code", "can_pull_ollama_models"],
  },
  {
    title: "Files",
    keys: ["can_write_files", "can_store_secrets"],
  },
  {
    title: "Notifications",
    keys: ["can_send_notifications"],
  },
  {
    title: "Finance",
    keys: ["can_access_internet", "can_place_real_orders"],
  },
];

const WARNING_KEYS: Array<keyof Permissions> = ["can_self_modify", "can_place_real_orders"];

export function PermissionsEditor() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Permissions | null>(null);
  const [warningKey, setWarningKey] = useState<keyof Permissions | null>(null);

  const permissionsQuery = useQuery({
    queryKey: ["admin", "permissions"],
    queryFn: api.admin.permissions,
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: (payload: PermissionsResponse) => api.admin.updatePermissions(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "permissions"] });
    },
  });

  useEffect(() => {
    if (permissionsQuery.data) {
      setDraft(permissionsQuery.data.permissions);
    }
  }, [permissionsQuery.data]);

  const dirty = useMemo(() => {
    if (!permissionsQuery.data || !draft) {
      return false;
    }

    return JSON.stringify(permissionsQuery.data.permissions) !== JSON.stringify(draft);
  }, [draft, permissionsQuery.data]);

  function setPermission(key: keyof Permissions, value: boolean) {
    if (!draft) {
      return;
    }

    if (value && WARNING_KEYS.includes(key)) {
      setWarningKey(key);
      return;
    }

    setDraft({ ...draft, [key]: value });
  }

  function confirmSensitiveToggle() {
    if (!draft || !warningKey) {
      return;
    }

    setDraft({ ...draft, [warningKey]: true });
    setWarningKey(null);
  }

  function save() {
    if (!draft || !permissionsQuery.data) {
      return;
    }

    updatePermissionsMutation.mutate({
      ...permissionsQuery.data,
      permissions: draft,
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-textPrimary">Permissions</h2>
          <p className="text-sm text-textSecondary">Toggle `MORGOTH_PERMS` capabilities grouped by operational domain.</p>
        </div>
        <Button onClick={save} disabled={!dirty || updatePermissionsMutation.isPending}>
          {updatePermissionsMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
      {permissionsQuery.isLoading ? <div className="h-56 animate-pulse rounded-lg bg-surface2" /> : null}
      {permissionsQuery.isError ? (
        <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
          Permissions could not be loaded.
        </div>
      ) : null}
      {!permissionsQuery.isLoading && !permissionsQuery.isError && draft ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {GROUPS.map((group) => (
            <div key={group.title} className="rounded-lg border border-border bg-surface2/30 p-4">
              <h3 className="mb-4 text-sm uppercase tracking-[0.16em] text-textMuted">{group.title}</h3>
              <div className="space-y-3">
                {group.keys.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-3">
                    <div>
                      <p className="font-mono text-xs text-textPrimary">{key}</p>
                    </div>
                    <Switch checked={draft[key]} onCheckedChange={(checked) => setPermission(key, checked)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {permissionsQuery.data ? (
        <p className="mt-4 text-sm text-textSecondary">
          Version <span className="font-mono text-textPrimary">{permissionsQuery.data.version}</span>, last updated by{" "}
          <span className="font-mono text-textPrimary">{permissionsQuery.data.metadata.updated_by}</span>
        </p>
      ) : null}
      <Dialog open={warningKey !== null} onOpenChange={(open) => !open && setWarningKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Sensitive Permission</DialogTitle>
            <DialogDescription>
              Enabling <span className="font-mono">{warningKey}</span> expands Morgoth's authority. Confirm before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setWarningKey(null)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={confirmSensitiveToggle}>
              Enable
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
