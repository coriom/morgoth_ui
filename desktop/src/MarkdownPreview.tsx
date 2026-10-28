import type { ReactNode } from "react";
import { linksFrom, type LocalNote } from "./notes";

const TOKEN = /(\[\[[^\]\n]{1,240}\]\]|\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

function inline(text: string, notes: readonly LocalNote[], onOpen: (id: string) => void): ReactNode[] {
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(text.slice(cursor, index));
    const token = match[0];
    if (token.startsWith("[[")) {
      if (index > 0 && text[index - 1] === "!") { result.push(token); cursor = index + token.length; continue; }
      const link = linksFrom(token)[0];
      const target = link && notes.find(note => note.note_id === link.target);
      result.push(target ? <button className="wiki-link" type="button" key={index} onClick={() => onOpen(target.note_id)}>{link.label === link.target ? target.title : link.label}</button>
        : <span key={index} className="broken-link" title="Note liée absente dans ce Project">{link?.label ?? token} · lien absent</span>);
    } else if (token.startsWith("**")) result.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else result.push(<code key={index}>{token.slice(1, -1)}</code>);
    cursor = index + token.length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

/** Deliberately bounded Markdown subset. React escapes all text; HTML and URLs are never executed. */
export function MarkdownPreview({ markdown, notes, onOpen }: { markdown: string; notes: readonly LocalNote[]; onOpen: (id: string) => void }) {
  const lines = markdown.slice(0, 32768).split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (paragraph.length) { blocks.push(<p key={`p-${blocks.length}`}>{inline(paragraph.join(" "), notes, onOpen)}</p>); paragraph = []; }
    if (bullets.length) { blocks.push(<ul key={`ul-${blocks.length}`}>{bullets.map((text, index) => <li key={index}>{inline(text, notes, onOpen)}</li>)}</ul>); bullets = []; }
  };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) { flush(); const content = inline(heading[2], notes, onOpen);
      blocks.push(heading[1].length === 1 ? <h2 key={`h-${blocks.length}`}>{content}</h2>
        : <h3 key={`h-${blocks.length}`}>{content}</h3>); continue; }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) { if (paragraph.length) flush(); bullets.push(bullet[1]); continue; }
    if (bullets.length) flush();
    paragraph.push(line);
  }
  flush();
  return <div className="markdown-preview">{blocks.length ? blocks : <p className="quiet">Cette note est vide.</p>}</div>;
}
