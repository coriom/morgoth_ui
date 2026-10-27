import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ManagementTransport, StructuredThesis, StructuredContradiction } from "./transport";
import { readThesisPage, readContradictionPage, readStructuredThesis, readStructuredContradiction } from "./structuredMemory";

const label: Record<StructuredThesis["status"], string> = {
  active: "Active", contradicted: "Contredite", quarantined: "Quarantainée", superseded: "Remplacée",
};
const when = (value: string) => new Date(value).toLocaleString("fr-FR");

function MemoryGraph({ theses, contradictions, openThesis, openContradiction }: {
  theses: StructuredThesis[]; contradictions: StructuredContradiction[];
  openThesis: (id: string) => void; openContradiction: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({x: 0, y: 0});
  const [drag, setDrag] = useState<{x:number;y:number}|null>(null);
  const height = Math.max(360, 64 * Math.max(theses.length, contradictions.length) + 40);
  const nodes = new Map(theses.map((item, index) => [item.thesis_id, 60 + index*64]));
  const edges = contradictions.flatMap((item,index) => [item.thesis_id_a,item.thesis_id_b]
    .filter(id => nodes.has(id)).map(id => ({id:`${item.contradiction_id}-${id}`,x1:180,y1:nodes.get(id)!,x2:520,y2:60+index*64})));
  return <div className="knowledge-columns memory-graph"><section aria-label="Graphe des relations enregistrées">
    <p className="source-stamp">Seules les relations explicites entre enregistrements chargés sont tracées. Les éléments manquants restent dans la liste textuelle.</p>
    <div className="graph-canvas"><svg viewBox={`0 0 700 ${height}`} role="img" aria-label="Thèses et contradictions enregistrées" onWheel={event=>{event.preventDefault();setZoom(v=>Math.max(.6,Math.min(2,v+(event.deltaY<0?.1:-.1))));}}
      onPointerDown={event=>{if((event.target as Element).closest("[data-node]"))return;setDrag({x:event.clientX,y:event.clientY});event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{if(!drag)return;setPan(v=>({x:v.x+event.clientX-drag.x,y:v.y+event.clientY-drag.y}));setDrag({x:event.clientX,y:event.clientY});}}
      onPointerUp={()=>setDrag(null)}>
      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {edges.map(edge=><line className="graph-edge" key={edge.id} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}/>)}
        {theses.map((item,index)=><g data-node="true" key={item.thesis_id} className="graph-node" transform={`translate(180 ${60+index*64})`} role="button" tabIndex={0}
          aria-label={`Ouvrir la thèse ${item.subject}`} onClick={()=>openThesis(item.thesis_id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openThesis(item.thesis_id);}}}>
          <circle r="9"/><text x="17" y="5">{item.subject.slice(0,24)}</text></g>)}
        {contradictions.map((item,index)=><g data-node="true" key={item.contradiction_id} className="graph-node" transform={`translate(520 ${60+index*64})`} role="button" tabIndex={0}
          aria-label="Ouvrir la contradiction" onClick={()=>openContradiction(item.contradiction_id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openContradiction(item.contradiction_id);}}}>
          <circle r="9"/><text x="17" y="5">{item.resolution ? "Résolue" : "Ouverte"}</text></g>)}
      </g></svg></div>
    <div className="graph-zoom"><button aria-label="Dézoomer" onClick={()=>setZoom(v=>Math.max(.6,v-.1))}>−</button><button aria-label="Zoomer" onClick={()=>setZoom(v=>Math.min(2,v+.1))}>+</button></div>
  </section><aside className="graph-inspector" aria-label="Navigation textuelle des relations"><h2>Thèses</h2>
    {theses.map(item=><button key={item.thesis_id} onClick={()=>openThesis(item.thesis_id)}>{item.subject} · {label[item.status]}</button>)}
    <h2>Contradictions</h2>{contradictions.map(item=><button key={item.contradiction_id} onClick={()=>openContradiction(item.contradiction_id)}>{item.subject_group ?? "Relation sans sujet"} · {item.resolution ? "résolue" : "non résolue"}</button>)}
  </aside></div>;
}

/** Optional and strictly read-only: no Project database is presumed initialized. */
export function StructuredMemory({projectId, verified, transport, openRequest}: {
  projectId: string|null; verified: boolean; transport: ManagementTransport;
  openRequest?: {id:string;seq:number}|null;
}) {
  const [mode,setMode] = useState<"records"|"graph">("records");
  const [offset,setOffset] = useState(0);
  const [relationOffset,setRelationOffset] = useState(0);
  const [queryText,setQueryText] = useState("");
  const [query,setQuery] = useState("");
  const [status,setStatus] = useState("");
  const [confidence,setConfidence] = useState("");
  const [day,setDay] = useState("");
  const [selected,setSelected] = useState<string|null>(null);
  const [selectedEdge,setSelectedEdge] = useState<string|null>(null);
  const lastRequest = useRef(0);
  const list = useQuery({queryKey:["d9","theses",projectId,offset,query,status,confidence],
    queryFn:async()=>readThesisPage(await transport.structuredTheses(projectId!,offset,query,status,confidence),projectId!,offset),
    enabled:verified&&!!projectId,retry:false,refetchOnWindowFocus:false});
  const relations = useQuery({queryKey:["d9","contradictions",projectId,relationOffset],
    queryFn:async()=>readContradictionPage(await transport.structuredContradictions(projectId!,relationOffset),projectId!,relationOffset),
    enabled:verified&&!!projectId,retry:false,refetchOnWindowFocus:false});
  const detail = useQuery({queryKey:["d9","thesis",projectId,selected],
    queryFn:async()=>readStructuredThesis(await transport.structuredThesis(projectId!,selected!),projectId!),
    enabled:verified&&!!projectId&&!!selected,retry:false,refetchOnWindowFocus:false});
  const edge = useQuery({queryKey:["d9","contradiction",projectId,selectedEdge],
    queryFn:async()=>readStructuredContradiction(await transport.structuredContradiction(projectId!,selectedEdge!),projectId!),
    enabled:verified&&!!projectId&&!!selectedEdge,retry:false,refetchOnWindowFocus:false});
  const firstSide = useQuery({queryKey:["d9","thesis",projectId,edge.data?.thesis_id_a],
    queryFn:async()=>readStructuredThesis(await transport.structuredThesis(projectId!,edge.data!.thesis_id_a),projectId!),
    enabled:!!edge.data&&verified,retry:false,refetchOnWindowFocus:false});
  const secondSide = useQuery({queryKey:["d9","thesis",projectId,edge.data?.thesis_id_b],
    queryFn:async()=>readStructuredThesis(await transport.structuredThesis(projectId!,edge.data!.thesis_id_b),projectId!),
    enabled:!!edge.data&&verified,retry:false,refetchOnWindowFocus:false});
  const records = list.isSuccess ? list.data.theses : [];
  const shown = useMemo(()=>day ? records.filter(item=>item.created_at.slice(0,10)===day):records,[records,day]);
  const edges = relations.isSuccess ? relations.data.contradictions : [];
  const openThesis = (id:string) => {setSelected(id);setSelectedEdge(null);setMode("records");};
  const openContradiction = (id:string) => {setSelected(null);setSelectedEdge(id);setMode("records");};
  useEffect(()=>{if(openRequest && openRequest.seq!==lastRequest.current){
    lastRequest.current=openRequest.seq; setSelected(openRequest.id);setSelectedEdge(null);setMode("records");
  }},[openRequest]);
  if (!projectId) return <div className="quiet-empty"><h2>Aucun Project</h2><p>Sélectionnez un Project géré.</p></div>;
  if (!verified) return <div className="quiet-empty"><h2>Project non vérifié</h2><p>Management doit confirmer l’identité avant toute lecture structurée.</p></div>;
  return <div className="backend-knowledge">
    <div className="document-meta"><span>Mémoire structurée du Project {projectId} · lecture seule</span><span>{list.isSuccess?`Lue le ${when(list.data.read_at)}`:"Aucune lecture confirmée"}</span></div>
    <p className="source-stamp">Énoncés produits et enregistrés par Morgoth. Leur présence ne prouve ni vérité, ni revue humaine. Confiance déclarée, non calibrée.</p>
    <div className="segmented" role="group" aria-label="Vue de la mémoire structurée"><button aria-pressed={mode==="records"} onClick={()=>setMode("records")}>Enregistrements</button><button aria-pressed={mode==="graph"} onClick={()=>setMode("graph")}>Relations</button><button onClick={()=>{void list.refetch();void relations.refetch();}}>Actualiser</button></div>
    {list.isPending && <p className="skeleton">Lecture de la mémoire autorisée…</p>}
    {list.isError && <p role="alert" className="notice warn">Mémoire structurée indisponible, non autorisée ou incompatible. Un Project créé peut ne pas avoir de base initialisée.</p>}
    {list.isSuccess && !records.length && <div className="quiet-empty"><h2>Aucune thèse enregistrée</h2><p>La source est lisible et cette page est vide.</p></div>}
    {list.isSuccess && records.length>0 && mode==="graph" && <MemoryGraph theses={records} contradictions={edges} openThesis={openThesis} openContradiction={openContradiction}/>}
    {list.isSuccess && records.length>0 && mode==="records" && <div className="knowledge-columns"><aside className="knowledge-list" aria-label="Thèses enregistrées">
      <form onSubmit={event=>{event.preventDefault();setOffset(0);setQuery(queryText.trim());}}><label htmlFor="memory-search">Sujet</label><input id="memory-search" type="search" maxLength={80} value={queryText} onChange={event=>setQueryText(event.target.value)} placeholder="Rechercher un sujet"/><button type="submit">Rechercher</button></form>
      <label htmlFor="memory-status">Statut</label><select id="memory-status" value={status} onChange={event=>{setStatus(event.target.value);setOffset(0);}}><option value="">Tous</option>{Object.entries(label).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
      <label htmlFor="memory-confidence">Confiance déclarée</label><select id="memory-confidence" value={confidence} onChange={event=>{setConfidence(event.target.value);setOffset(0);}}><option value="">Toutes</option><option value="low">Faible</option><option value="medium">Moyenne</option><option value="high">Élevée</option></select>
      <label htmlFor="memory-day">Date sur cette page</label><input id="memory-day" type="date" value={day} onChange={event=>setDay(event.target.value)}/>
      {shown.map(item=><button key={item.thesis_id} className={selected===item.thesis_id?"document-row selected":"document-row"} onClick={()=>openThesis(item.thesis_id)}><strong>{item.subject}</strong><small>{label[item.status]} · {when(item.created_at)}</small></button>)}
      {!shown.length && <p>Aucune thèse correspondante sur cette page.</p>}
      <div className="editor-actions"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Précédent</button><button disabled={list.data.next_offset===null} onClick={()=>setOffset(list.data.next_offset!)}>Suivant</button></div>
    </aside><article className="note-document" aria-label="Mémoire sélectionnée">
      {selected && detail.isPending && <p className="skeleton">Lecture de la thèse…</p>}
      {selected && detail.isError && <p role="alert">Thèse absente ou indisponible à cette lecture.</p>}
      {selected && detail.isSuccess && <><div className="document-meta"><span>Thèse enregistrée · {label[detail.data.status]}</span><span>{when(detail.data.created_at)}</span></div><h2>{detail.data.subject}</h2><p>{detail.data.claim}</p>
        <p className="source-stamp">Confiance déclarée : {detail.data.confidence} · version : {detail.data.code_version??"inconnue"} · objectif : {detail.data.objective_id??"non enregistré"}</p>
        {detail.data.quarantine_reason && <p className="notice warn">Quarantaine enregistrée : {detail.data.quarantine_reason}</p>}
        {detail.data.superseded_by && <p>Remplacée par <button onClick={()=>openThesis(detail.data.superseded_by!)}>{detail.data.superseded_by}</button></p>}
        <h3>Sources mentionnées</h3>{detail.data.evidence_sources.length ? <ul>{detail.data.evidence_sources.map((source,index)=><li key={index}>{source.source}</li>)}</ul>:<p>Aucune source exploitable exposée.</p>}
        <p className="source-stamp">{detail.data.evidence_count} élément(s) d’évidence enregistré(s) ; détails bruts exclus. {detail.data.evidence_omitted?"Certaines sources sont omises.":""}</p></>}
      {selectedEdge && edge.isPending && <p className="skeleton">Lecture de la contradiction…</p>}
      {selectedEdge && edge.isError && <p role="alert">Contradiction absente ou indisponible.</p>}
      {selectedEdge && edge.isSuccess && <><div className="document-meta"><span>Contradiction enregistrée · {edge.data.resolution?"résolue":"non résolue"}</span><span>{when(edge.data.detected_at)}</span></div>
        <h2>{edge.data.subject_group??"Contradiction sans sujet enregistré"}</h2><p>Résolution : {edge.data.resolution??"Aucune résolution enregistrée"}</p>
        {[firstSide,secondSide].map((side,index)=><div key={index}><h3>Côté {index===0?"A":"B"}</h3>{side.isSuccess?<button onClick={()=>openThesis(side.data.thesis_id)}>{side.data.subject} · {label[side.data.status]}</button>:<p>Thèse liée absente ou indisponible.</p>}</div>)}
      </>}
      {!selected&&!selectedEdge&&<div className="quiet-empty"><h2>Une mémoire enregistrée</h2><p>Choisissez une thèse ou une contradiction. Aucun résumé n’est généré.</p></div>}
    </article><aside className="note-relations" aria-label="Relations structurées"><h3>Contradictions</h3>
      {relations.isError&&<p role="alert">Relations indisponibles.</p>}
      {selected&&edges.filter(item=>item.thesis_id_a===selected||item.thesis_id_b===selected).map(item=><button key={item.contradiction_id} onClick={()=>openContradiction(item.contradiction_id)}>{item.subject_group??"Relation"} · {item.resolution?"résolue":"non résolue"}</button>)}
      {selected&&!edges.some(item=>item.thesis_id_a===selected||item.thesis_id_b===selected)&&<p>Aucune relation dans la page chargée.</p>}
      {relations.isSuccess&&<div className="editor-actions"><button disabled={relationOffset===0} onClick={()=>setRelationOffset(Math.max(0,relationOffset-20))}>Relations précédentes</button><button disabled={relations.data.next_offset===null} onClick={()=>setRelationOffset(relations.data.next_offset!)}>Relations suivantes</button></div>}
      {relations.isSuccess&&<p className="source-stamp">Relations de la page {Math.floor(relationOffset/20)+1} ; le graphe montre les enregistrements actuellement chargés.</p>}
      <p className="source-stamp">Source PostgreSQL du Project · lecture authentifiée, sans modification.</p>
    </aside></div>}
  </div>;
}
