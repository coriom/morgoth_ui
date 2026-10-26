import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { readKnowledgeCorpus, readKnowledgeDocument, readKnowledgePage } from "./backendKnowledge";
import type { KnowledgeDocument, ManagementTransport } from "./transport";

function contentView(content: string, document: KnowledgeDocument, titles: Map<string, string>, open: (id: string) => void) {
  const links = document.links;
  let linkIndex = 0;
  const lines = content.split("\n");
  return <div className="markdown-preview">{lines.map((line, row) => {
    const display = line.replace(/^#{1,3} /, "").replace(/^[-*] /, "");
    const pieces = display.split(/(\[\[[^\[\]\n]{1,180}\]\])/g).map((piece, index) => {
      if (!piece.startsWith("[[") || !piece.endsWith("]]")) return piece;
      const link = links[linkIndex++];
      if (!link) return piece;
      return link.target_id && titles.has(link.target_id)
        ? <button className="wiki-link" key={index} type="button" onClick={() => open(link.target_id!)}>{link.label}</button>
        : <span className="broken-link" key={index}>{link.label} · lien absent</span>;
    });
    if (line.startsWith("# ")) return <h2 key={row}>{pieces}</h2>;
    if (line.startsWith("## ")) return <h3 key={row}>{pieces}</h3>;
    if (line.startsWith("- ")) return <p key={row}>• {pieces}</p>;
    return <p key={row}>{pieces.length ? pieces : "\u00a0"}</p>;
  })}</div>;
}

function SourceGraph({ documents, selected, select, open }: {
  documents: KnowledgeDocument[]; selected: string | null; select: (id: string) => void; open: (id: string) => void;
}) {
  const [local, setLocal] = useState(false);
  const [filter, setFilter] = useState("");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({x:0,y:0});
  const drag = useRef<{x:number;y:number} | null>(null);
  const linked = new Set<string>(selected ? [selected] : []);
  if (selected) for (const doc of documents) {
    if (doc.document_id === selected) doc.links.forEach(link => { if (link.target_id) linked.add(link.target_id); });
    if (doc.links.some(link => link.target_id === selected)) linked.add(doc.document_id);
  }
  const visible = documents.filter(doc => (!local || !selected || linked.has(doc.document_id))
    && doc.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const points = new Map(visible.map((doc, index) => [doc.document_id, {
    x: 120 + (index % 4) * 175, y: 90 + Math.floor(index / 4) * 110,
  }]));
  const edges = visible.flatMap(doc => doc.links.filter(link => link.target_id && points.has(link.target_id))
    .map(link => ({source:doc.document_id,target:link.target_id!})));
  const zoom = (delta:number) => setScale(value => Math.min(2, Math.max(.5, value + delta)));
  return <div className="knowledge-graph"><div className="graph-toolbar">
    <label htmlFor="backend-graph-search" className="sr-only">Rechercher un document</label>
    <input id="backend-graph-search" type="search" value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Rechercher un nœud…" />
    <button type="button" aria-pressed={local} onClick={()=>setLocal(value=>!value)}>{local ? "Graphe local" : "Graphe global"}</button>
    <button type="button" onClick={()=>{setPan({x:0,y:0});setScale(1);}}>Réinitialiser</button>
  </div><div className="graph-layout"><div className="graph-canvas"><svg viewBox="0 0 760 520" role="group" aria-label="Relations Wikilink réellement enregistrées"
      onWheel={event=>{event.preventDefault();zoom(event.deltaY < 0 ? .08 : -.08);}}
      onPointerDown={event=>{if ((event.target as Element).closest(".graph-node")) return;drag.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{if (!drag.current) return;setPan(value=>({x:value.x+event.clientX-drag.current!.x,y:value.y+event.clientY-drag.current!.y}));drag.current={x:event.clientX,y:event.clientY};}}
      onPointerUp={()=>{drag.current=null;}}><g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
      {edges.map((edge,index)=>{const a=points.get(edge.source)!;const b=points.get(edge.target)!;return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="graph-edge" />;})}
      {visible.map(doc=>{const p=points.get(doc.document_id)!;return <g key={doc.document_id} className={`graph-node${selected===doc.document_id?" selected":""}`}
        transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`Sélectionner ${doc.title}`}
        onClick={()=>select(doc.document_id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select(doc.document_id);}}}>
        <circle r={selected===doc.document_id?12:9}/><text y="34">{doc.title.length>18?doc.title.slice(0,18)+"…":doc.title}</text></g>;})}
    </g></svg><div className="graph-zoom"><button aria-label="Dézoomer" onClick={()=>zoom(-.15)}>−</button><button aria-label="Zoomer" onClick={()=>zoom(.15)}>＋</button></div></div>
    <aside className="graph-inspector" aria-label="Navigation textuelle des documents"><h2>Documents</h2><p>Relations enregistrées dans les fichiers du Project.</p>
      {visible.map(doc=><button key={doc.document_id} type="button" aria-current={selected===doc.document_id?"true":undefined} onClick={()=>open(doc.document_id)}>{doc.title}</button>)}
      {!visible.length && <p>Aucun document correspondant.</p>}</aside></div></div>;
}

/** Read-only Project vault; personal notes stay in their separate native store. */
export function BackendKnowledge({ projectId, verified, transport, openRequest }: {
  projectId: string | null; verified: boolean; transport: ManagementTransport;
  openRequest: {id:string;seq:number} | null;
}) {
  const [mode,setMode] = useState<"documents"|"graph">("documents");
  const [selected,setSelected] = useState<string|null>(null);
  const [text,setText] = useState("");
  const [query,setQuery] = useState("");
  const [searchError,setSearchError] = useState(false);
  const corpus = useQuery({queryKey:["d6","vault",projectId],queryFn:()=>readKnowledgeCorpus(transport,projectId!),
    enabled:verified && !!projectId,retry:false,refetchOnWindowFocus:false});
  const search = useQuery({queryKey:["d6","vault-search",projectId,query],
    queryFn:async()=>readKnowledgePage(await transport.knowledge(projectId!,0,query),projectId!,0),
    enabled:verified && !!projectId && !!query,retry:false,refetchOnWindowFocus:false});
  const docs = corpus.isSuccess ? corpus.data.documents : [];
  const available = useMemo(()=>new Map(docs.map(doc=>[doc.document_id,doc.title])),[docs]);
  const detail = useQuery({queryKey:["d6","vault-detail",projectId,selected],
    queryFn:async()=>readKnowledgeDocument(await transport.knowledgeDocument(projectId!,selected!),projectId!),
    enabled:verified && !!projectId && !!selected && available.has(selected),retry:false,refetchOnWindowFocus:false});
  const open = (id:string) => {if(available.has(id)){setSelected(id);setMode("documents");}};
  // Palette requests are scoped by the parent to this component instance.
  const requestId = openRequest?.id;
  const requestSeq = openRequest?.seq;
  const handled = useRef(0);
  useEffect(()=>{if(requestId && requestSeq && requestSeq!==handled.current && available.has(requestId)) {
    handled.current=requestSeq;setSelected(requestId);setMode("documents");
  }},[requestId,requestSeq,available]);
  const shown = query ? search.isSuccess ? search.data.documents : [] : docs.filter(doc=>doc.title.toLocaleLowerCase().includes(text.toLocaleLowerCase()));
  if (!projectId) return <div className="quiet-empty"><h2>Aucun Project</h2><p>Sélectionnez un Project pour consulter son coffre.</p></div>;
  if (!verified) return <div className="quiet-empty"><h2>Source non vérifiée</h2><p>Le catalogue Management doit confirmer ce Project. Vos notes personnelles restent disponibles hors ligne.</p></div>;
  return <div className="backend-knowledge">
    <div className="document-meta"><span>Coffre Markdown du Project {projectId} · lecture seule</span><span>{corpus.isSuccess ? `Lu le ${new Date(corpus.data.readAt).toLocaleString("fr-FR")}` : "Aucune lecture confirmée"}</span></div>
    <div className="segmented" role="group" aria-label="Vue du coffre"><button type="button" aria-pressed={mode==="documents"} onClick={()=>setMode("documents")}>Documents</button><button type="button" aria-pressed={mode==="graph"} onClick={()=>setMode("graph")}>Graphe</button><button type="button" onClick={()=>void corpus.refetch()} disabled={corpus.isFetching}>Actualiser</button></div>
    {corpus.isPending && <p className="skeleton">Lecture du coffre autorisé…</p>}
    {corpus.isError && <p role="alert" className="notice warn">Coffre indisponible, incompatible ou trop volumineux. Aucun document n’est présumé absent.</p>}
    {corpus.isSuccess && !docs.length && <div className="quiet-empty"><h2>Coffre vide</h2><p>Ce Project possède un coffre accessible, sans document Markdown enregistré.</p></div>}
    {corpus.isSuccess && docs.length>0 && mode==="graph" && <SourceGraph documents={docs} selected={selected} select={setSelected} open={open}/>}
    {corpus.isSuccess && docs.length>0 && mode==="documents" && <div className="knowledge-columns"><aside className="knowledge-list" aria-label="Documents Morgoth">
      <form onSubmit={event=>{event.preventDefault();if(text.length<=80){setQuery(text.trim());setSearchError(false);}else setSearchError(true);}}>
        <label htmlFor="vault-search">Rechercher dans le coffre</label><input id="vault-search" type="search" value={text} onChange={event=>setText(event.target.value)} maxLength={80} placeholder="Titre ou contenu…" />
        <button type="submit">Rechercher</button>{query && <button type="button" onClick={()=>{setQuery("");setText("");}}>Effacer</button>}</form>
      {searchError && <p role="alert">Recherche limitée à 80 caractères.</p>}
      {search.isFetching && <p className="skeleton">Recherche locale…</p>}
      {search.isError && <p role="alert">Recherche indisponible.</p>}
      {shown.map(doc=><button key={doc.document_id} type="button" className={selected===doc.document_id?"document-row selected":"document-row"} onClick={()=>open(doc.document_id)}><strong>{doc.title}</strong><small>Fichier Markdown · {new Date(doc.recorded_at).toLocaleString("fr-FR")}</small></button>)}
      {!shown.length && !search.isFetching && !search.isError && <p>Aucun document correspondant.</p>}
      {query && search.isSuccess && search.data.next_offset!==null && <p className="source-stamp">20 premiers résultats seulement. Affinez la recherche.</p>}
    </aside><article className="note-document" aria-label="Document Morgoth">
      {detail.isPending && selected && <p className="skeleton">Lecture du document…</p>}
      {detail.isError && <p role="alert">Document indisponible. La liste précédente n’est pas une preuve de disponibilité actuelle.</p>}
      {detail.isSuccess && detail.data.document_id===selected && <><div className="document-meta"><span>Coffre Markdown · lecture seule</span><span>Modifié {new Date(detail.data.recorded_at).toLocaleString("fr-FR")}</span></div>
        {contentView(detail.data.content ?? "",detail.data,available,open)}</>}
      {!selected && <div className="quiet-empty"><h2>Un document de Project</h2><p>Choisissez un document. Son contenu n’est pas présenté comme un fait vérifié.</p></div>}
    </article><aside className="note-relations" aria-label="Relations enregistrées"><h3>Liens sortants</h3>
      {detail.isSuccess && detail.data.links.map((link,index)=>link.target_id && available.has(link.target_id!)
        ? <button key={index} type="button" onClick={()=>open(link.target_id!)}>{link.label}</button>
        : <span key={index} className="broken-link">{link.label} · document absent</span>)}
      {detail.isSuccess && !detail.data.links.length && <p>Aucun lien.</p>}
      <h3>Rétroliens</h3>{selected && docs.filter(doc=>doc.links.some(link=>link.target_id===selected)).map(doc=><button key={doc.document_id} type="button" onClick={()=>open(doc.document_id)}>{doc.title}</button>)}
      <p className="source-stamp">Modifié : date du fichier. Vérification humaine et confiance : non enregistrées.</p>
    </aside></div>}
  </div>;
}
