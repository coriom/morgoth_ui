import { useEffect, useState } from "react";
import { type BackupReceipt, type BackupTransport, nativeBackups, readCounts, readPreview, readReceipt, type RestorePreview } from "./backups";

function message(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "TARGET_NOT_EMPTY") return "L’espace contient déjà des notes ou briefs. La restauration ne fusionne pas les données.";
  if (code === "RECOVERY_BLOCKED" || code === "RECOVERY_CONFLICT") return "Une restauration interrompue existe, mais ce fichier ne permet pas une reprise sûre.";
  if (code === "ARCHIVE_CHANGED") return "Le fichier a changé depuis sa prévisualisation. Recommencez la sélection.";
  if (code === "DESTINATION_EXISTS" || code === "DESTINATION_EXISTS_OR_UNAVAILABLE") return "Le fichier de destination existe déjà ou ne permet pas la publication sûre.";
  if (code === "INVALID_ARCHIVE" || code === "OVERSIZED_ARCHIVE") return "Sauvegarde invalide, altérée ou trop volumineuse.";
  if (code === "DIALOG_UNAVAILABLE") return "Le sélecteur de fichier natif est indisponible.";
  return "Opération indisponible. Aucune donnée existante n’a été remplacée.";
}
const date = (stamp: number) => new Date(stamp).toLocaleString("fr-FR");

export function BackupWorkspace({ projectId, verified, onRestored, transport = nativeBackups }: {
  projectId: string | null; verified: boolean; onRestored: () => void; transport?: BackupTransport;
}) {
  const [counts, setCounts] = useState<[number, number] | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [last, setLast] = useState<{ kind: "export" | "restore"; receipt: BackupReceipt } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setCounts(null); setPreview(null); setLast(null); setError(null);
    if (projectId && verified) void transport.counts(projectId).then(value => { if (active) setCounts(readCounts(value)); })
      .catch(() => { if (active) setError("Comptage local indisponible."); });
    return () => { active = false; };
  }, [projectId, verified, transport]);
  const exportBackup = async () => {
    if (!projectId || !verified) return;
    setBusy(true); setError(null); setPreview(null);
    try { const result = await transport.export(projectId); if (result !== null) setLast({ kind: "export", receipt: readReceipt(result, projectId) }); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const selectBackup = async () => {
    if (!projectId || !verified) return;
    setBusy(true); setError(null); setPreview(null);
    try { const result = await transport.preview(projectId); if (result !== null) setPreview(readPreview(result, projectId)); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    if (!projectId || !verified || !preview) return;
    setBusy(true); setError(null);
    try {
      const result = await transport.restore(projectId, preview.token);
      if (result === null) { setPreview(null); return; }
      const receipt = readReceipt(result, projectId);
      setLast({ kind: "restore", receipt }); setPreview(null);
      setCounts([receipt.notes_count, receipt.drafts_count]); onRestored();
    } catch (cause) { setPreview(null); setError(message(cause)); }
    finally { setBusy(false); }
  };
  return <div className="settings-index backup-workspace">
    <h2>Données et sauvegardes</h2>
    <p>Exportez les notes personnelles et briefs locaux du Project sélectionné. Le coffre backend, les modèles et les identifiants ne sont pas inclus.</p>
    <p className="source-stamp">Format 1 · fichier JSON portable · non chiffré · aucune synchronisation automatique.</p>
    {!projectId && <p role="status">Sélectionnez un Project géré pour accéder aux sauvegardes.</p>}
    {projectId && !verified && <p role="status">Project {projectId} mémorisé localement, mais non vérifié par Management. Export et restauration indisponibles.</p>}
    {projectId && verified && <>
      <dl className="fact-list"><div className="fact"><dt>Project</dt><dd>{projectId}</dd></div>
        <div className="fact"><dt>Contenu local</dt><dd>{counts ? `${counts[0]} notes · ${counts[1]} briefs` : "Lecture en cours ou indisponible"}</dd></div></dl>
      <div className="backup-actions"><button type="button" disabled={busy || !counts} onClick={() => void exportBackup()}>Exporter le Project…</button>
        <button type="button" disabled={busy || !counts} onClick={() => void selectBackup()}>Choisir une sauvegarde à restaurer…</button></div>
      {preview && <section className="backup-preview" aria-label="Prévisualisation de la restauration"><h3>{preview.receipt.recovery_required ? "Reprendre une restauration interrompue" : "Confirmer la restauration"}</h3>
        <p>{preview.receipt.notes_count} notes · {preview.receipt.drafts_count} briefs · export du {date(preview.receipt.exported_at_ms)} · format {preview.receipt.schema_version}</p>
        <p>Empreinte SHA-256 : <code>{preview.receipt.sha256}</code></p>
        <p>Les liens internes et identifiants sont conservés. Aucun contenu existant n’est effacé.</p>
        <button type="button" disabled={busy} onClick={() => void restore()}>Restaurer dans {projectId}</button>
        <button type="button" disabled={busy} onClick={() => setPreview(null)}>Annuler</button></section>}
      {last && <p role="status">{last.kind === "export" ? "Sauvegarde exportée" : "Restauration terminée"} · {last.receipt.notes_count} notes · {last.receipt.drafts_count} briefs · SHA-256 {last.receipt.sha256}</p>}
      {error && <p role="alert" className="notice warn">{error}</p>}
    </>}
  </div>;
}
