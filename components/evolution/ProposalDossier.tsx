"use client";

/**
 * ProposalDossier — the decision surface for one pending_approval proposal.
 *
 * Shows the FULL context an operator needs to decide (tool name,
 * rationale, rendered code, shadow verdict + axes), plus the three
 * actions:
 *   [Approve]  optional comment
 *   [Reject]   reason REQUIRED (empty → submit disabled)
 *   [Apply]    only after approved; confirm dialog (irreversible);
 *              then a progress bar polling /apply-status
 *
 * The three actions call Next.js server routes that inject the
 * X-Morgoth-Token header from ~/.morgoth/ui_token — the browser never
 * sees the token.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils/cn";
import type { ProposalRow } from "@/types/morgoth";

function ShadowSummary({ proposal }: { proposal: ProposalRow }) {
  const latest = proposal.shadow_verdicts[0];
  if (!latest) {
    return <p className="text-xs text-textMuted">no shadow verdict recorded</p>;
  }
  return (
    <div className="space-y-2 rounded border border-border bg-surface2 p-3 text-xs">
      <p className="font-mono">
        verdict: <span className="font-semibold text-textPrimary">{latest.verdict}</span>{" "}
        <span className="text-textMuted">
          engine={latest.engine} prompt={latest.prompt_version}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-1">
        {Object.entries(latest.axes ?? {}).map(([axis, level]) => (
          <div key={axis} className="flex justify-between gap-2 font-mono">
            <span className="text-textMuted">{axis}</span>
            <span className="text-textPrimary">{String(level)}</span>
          </div>
        ))}
      </div>
      {latest.reasons?.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-textSecondary">
          {latest.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ApplyProgress({ proposalId }: { proposalId: string }) {
  const { data } = useQuery({
    queryKey: ["proposals", proposalId, "apply-status"],
    queryFn: () => api.proposals.applyStatus(proposalId),
    refetchInterval: (query) => {
      const s = query.state.data;
      // Stop polling once terminal state is reached — otherwise the
      // background tab keeps hitting the endpoint forever.
      if (!s) return 2000;
      if (s.terminal !== null) return false;
      return 2000;
    },
  });
  if (!data) return <p className="text-xs text-textMuted">polling apply-status…</p>;
  const done = data.terminal !== null;
  return (
    <div className="rounded border border-border bg-surface2 p-3 text-xs">
      <p className="font-mono">
        step: <span className="font-semibold text-textPrimary">{data.step}</span>
        {" · "}
        status: <span className="text-textPrimary">{data.status}</span>
      </p>
      {data.status_reason ? (
        <p className="mt-1 whitespace-pre-wrap text-textSecondary">{data.status_reason}</p>
      ) : null}
      {done ? (
        <p
          className={cn(
            "mt-2 font-semibold",
            data.terminal === "applied" ? "text-result" : "text-error",
          )}
        >
          {data.terminal === "applied"
            ? "APPLIED — commit landed, service restarted."
            : `ROLLED BACK — ${data.terminal}`}
        </p>
      ) : (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full w-1/2 animate-pulse bg-primary" />
        </div>
      )}
    </div>
  );
}

export function ProposalDossier({ proposal }: { proposal: ProposalRow }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applyStarted, setApplyStarted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["proposals"] });
  };

  const approveMutation = useMutation({
    mutationFn: () => api.proposals.approve(proposal.proposal_id, comment || undefined),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.proposals.reject(proposal.proposal_id, reason),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const applyMutation = useMutation({
    mutationFn: () => api.proposals.apply(proposal.proposal_id),
    onSuccess: () => {
      setActionError(null);
      setApplyStarted(true);
      invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const isPending = proposal.status === "pending_approval";
  const isApproved = proposal.status === "approved_pending_apply";
  const busy =
    approveMutation.isPending || rejectMutation.isPending || applyMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          <span className="font-mono">{proposal.target_path}</span>
          <span className="ml-2 rounded bg-surface2 px-2 py-0.5 text-xs text-textSecondary">
            {proposal.status}
          </span>
        </CardTitle>
        <p className="text-xs text-textMuted">
          {proposal.proposal_id.slice(0, 8)} · engine={proposal.engine} ·
          proposed_by={proposal.proposed_by}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-textMuted">
            Rationale
          </h4>
          <p className="whitespace-pre-wrap text-sm text-textPrimary">
            {proposal.rationale ?? "(none)"}
          </p>
        </section>

        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-textMuted">
            Shadow verdict
          </h4>
          <ShadowSummary proposal={proposal} />
        </section>

        <section>
          <button
            type="button"
            onClick={() => setShowCode((s) => !s)}
            className="text-xs font-semibold uppercase text-textMuted hover:text-textPrimary"
          >
            {showCode ? "▾ Hide" : "▸ Show"} rendered code ({proposal.content.length} chars)
          </button>
          {showCode ? (
            <pre className="mt-2 max-h-[400px] overflow-auto rounded border border-border bg-surface2 p-3 font-mono text-xs">
              {proposal.content}
            </pre>
          ) : null}
        </section>

        {proposal.status_reason ? (
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-textMuted">
              Last note
            </h4>
            <p className="whitespace-pre-wrap text-xs text-textSecondary">
              {proposal.status_reason}
            </p>
          </section>
        ) : null}

        {isPending ? (
          <section className="space-y-3 border-t border-border pt-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-textMuted">
                Approve — optional comment
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="w-full rounded border border-border bg-surface2 px-2 py-1 text-sm text-textPrimary"
                placeholder="Why this looked safe (optional)…"
              />
              <Button
                type="button"
                disabled={busy}
                onClick={() => approveMutation.mutate()}
                className="mt-1"
              >
                Approve
              </Button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-textMuted">
                Reject — reason required
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded border border-border bg-surface2 px-2 py-1 text-sm text-textPrimary"
                placeholder="Why this is being rejected…"
              />
              <Button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => rejectMutation.mutate()}
                className="mt-1"
              >
                Reject
              </Button>
            </div>
          </section>
        ) : null}

        {isApproved ? (
          <section className="space-y-2 border-t border-border pt-3">
            {!applyStarted && !confirmApply ? (
              <Button type="button" onClick={() => setConfirmApply(true)} disabled={busy}>
                Apply…
              </Button>
            ) : null}
            {!applyStarted && confirmApply ? (
              <div className="rounded border border-error/50 bg-error/10 p-3 text-sm text-error">
                <p className="mb-2 font-semibold">
                  Confirm apply — irreversible.
                </p>
                <p className="mb-2 text-xs">
                  Writes {proposal.target_path}, runs the full pytest, commits
                  locally, restarts the service, and verifies health. On any
                  failure the commit is rolled back with git reset --hard HEAD~1.
                  Takes 25-50 minutes.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => applyMutation.mutate()}
                    disabled={busy}
                  >
                    Yes, apply
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setConfirmApply(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
            {applyStarted ? <ApplyProgress proposalId={proposal.proposal_id} /> : null}
          </section>
        ) : null}

        {actionError ? (
          <p className="rounded border border-error/40 bg-error/10 p-2 text-xs text-error">
            {actionError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
