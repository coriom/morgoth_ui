import { useMemo, useRef, useState } from "react";
import { linksFrom, type LocalNote } from "./notes";

function layout(notes: readonly LocalNote[], focus: string | null, local: boolean) {
  const indexed = new Map(notes.map(note => [note.note_id, note]));
  const neighbours = new Set<string>(focus ? [focus] : []);
  if (focus) for (const note of notes) {
    if (note.note_id === focus) linksFrom(note.markdown).forEach(link => neighbours.add(link.target));
    if (linksFrom(note.markdown).some(link => link.target === focus)) neighbours.add(note.note_id);
  }
  const visible = notes.filter(note => !local || !focus || neighbours.has(note.note_id)).slice(0, 160);
  const sorted = [...visible].sort((a, b) => a.collection.localeCompare(b.collection) || a.note_id.localeCompare(b.note_id));
  const positions = new Map<string, { x: number; y: number }>();
  const columns = 7;
  sorted.forEach((note, index) => positions.set(note.note_id, { x: 90 + (index % columns) * 112, y: 88 + Math.floor(index / columns) * 100 }));
  const edges: { source: string; target: string }[] = [];
  for (const note of sorted) for (const link of linksFrom(note.markdown)) {
    if (positions.has(link.target)) edges.push({ source: note.note_id, target: link.target });
  }
  return { nodes: sorted, positions, edges, indexed, neighbours,
    height: Math.max(520, Math.ceil(sorted.length / columns) * 100 + 120), truncated: visible.length < notes.filter(note => !local || !focus || neighbours.has(note.note_id)).length };
}

/** Stable bounded SVG layout, with an equivalent keyboard-accessible note list. */
export function KnowledgeGraph({ notes, selectedId, onSelect, onOpen }: {
  notes: readonly LocalNote[]; selectedId: string | null; onSelect: (id: string) => void; onOpen: (id: string) => void;
}) {
  const [local, setLocal] = useState(false);
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("all");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const graph = useMemo(() => layout(notes, selectedId, local), [notes, selectedId, local]);
  const visible = graph.nodes.filter(note => (collection === "all" || note.collection === collection)
    && (!query.trim() || note.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const visibleIds = new Set(visible.map(note => note.note_id));
  const selected = selectedId ? graph.indexed.get(selectedId) : null;
  const broken = selected ? linksFrom(selected.markdown).filter(link => !graph.indexed.has(link.target)) : [];
  const collections = [...new Set(notes.map(note => note.collection))].sort((a,b) => a.localeCompare(b));
  const zoom = (delta: number) => setScale(value => Math.min(2, Math.max(.55, value + delta)));
  if (!notes.length) return <div className="empty-evidence"><h2>Aucune note à relier</h2><p>Créez une note personnelle dans ce Project. Le graphe reflétera ses liens enregistrés.</p></div>;
  return <div className="knowledge-graph">
    <div className="graph-toolbar"><label htmlFor="graph-search">Rechercher un nœud</label><input id="graph-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Titre de note…" />
      <label htmlFor="graph-collection">Collection</label><select id="graph-collection" value={collection} onChange={event => setCollection(event.target.value)}><option value="all">Toutes</option>{collections.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <button type="button" aria-pressed={local} onClick={() => setLocal(value => !value)}>{local ? "Graphe local" : "Graphe global"}</button>
      <button type="button" onClick={() => { setPan({x:0,y:0}); setScale(1); setQuery(""); }}>Réinitialiser la vue</button></div>
    {graph.truncated && <p className="source-stamp">Le dessin est limité à 160 notes. La liste et la recherche restent disponibles dans Notes.</p>}
    <div className="graph-layout"><div className="graph-canvas">
      <svg viewBox={`0 0 870 ${graph.height}`} role="group" aria-label="Graphe des liens enregistrés entre notes du Project"
        onWheel={event => { event.preventDefault(); zoom(event.deltaY < 0 ? .08 : -.08); }}
        onPointerDown={event => { if ((event.target as Element).closest(".graph-node")) return; drag.current = {x:event.clientX,y:event.clientY}; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (!drag.current) return; setPan(value => ({x:value.x+(event.clientX-drag.current!.x),y:value.y+(event.clientY-drag.current!.y)})); drag.current={x:event.clientX,y:event.clientY}; }}
        onPointerUp={() => { drag.current = null; }}>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
          {graph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)).map((edge, index) => {
            const a = graph.positions.get(edge.source)!; const b = graph.positions.get(edge.target)!;
            return <line key={`${edge.source}-${edge.target}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="graph-edge" />;
          })}
          {visible.map(note => { const pos = graph.positions.get(note.note_id)!;
            return <g key={note.note_id} className={`graph-node${note.note_id === selectedId ? " selected" : ""}`} transform={`translate(${pos.x} ${pos.y})`}
              role="button" tabIndex={0} aria-label={`Sélectionner ${note.title}`} onClick={() => onSelect(note.note_id)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(note.note_id); } }}>
              <circle r={note.note_id === selectedId ? 12 : 9} /><text y="30">{note.title.length > 24 ? `${note.title.slice(0,24)}…` : note.title}</text></g>; })}
        </g></svg><div className="graph-zoom"><button aria-label="Dézoomer" onClick={() => zoom(-.15)}>−</button><button aria-label="Zoomer" onClick={() => zoom(.15)}>＋</button></div>
      </div><aside className="graph-inspector" aria-label="Navigation textuelle dans le graphe">
        <h2>{selected?.title ?? "Sélectionnez une note"}</h2><p>{selected ? `${selected.collection} · note personnelle locale` : "Les relations proviennent des liens Markdown enregistrés."}</p>
        {selected && <button type="button" className="text-link" onClick={() => onOpen(selected.note_id)}>Ouvrir la note →</button>}
        {broken.length > 0 && <p className="broken-link">{broken.length} lien(s) vers des notes absentes de ce Project.</p>}
        <h3>Notes visibles</h3><ul>{visible.map(note => <li key={note.note_id}><button type="button" onClick={() => onSelect(note.note_id)} aria-current={selectedId === note.note_id ? "true" : undefined}>{note.title}</button></li>)}</ul>
        {!visible.length && <p>Aucun titre correspondant.</p>}
      </aside></div>
  </div>;
}
