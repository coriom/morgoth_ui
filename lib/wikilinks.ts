/**
 * Client-side wikilink transform.
 *
 * Converts Obsidian-style ``[[target]]`` and ``[[target|label]]``
 * markers into standard markdown link syntax pointing at the
 * ``/wiki/<slug>`` route. Applied to the raw markdown BEFORE handing
 * it to react-markdown so the default link renderer (or a custom
 * override) picks up the internal routes uniformly with external
 * links.
 *
 * Targets may contain forward slashes (e.g. ``entities/btc-short-
 * term-price``). The transform strips the trailing ``.md`` if the
 * model emitted it and turns the target directly into the URL path;
 * the wiki page component fetches ``<target>.md`` from the manifest
 * on navigation.
 */

const WIKILINK_RE = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g;

export function transformWikilinks(markdown: string): string {
  return markdown.replace(WIKILINK_RE, (_match, target: string, label?: string) => {
    const cleanTarget = target.trim().replace(/\.md$/i, "");
    const linkText = (label ?? cleanTarget).trim();
    return `[${linkText}](/wiki/${cleanTarget})`;
  });
}
