// Shared markdown → HTML rendering, used by table cells in the live preview
// and by embed transclusion (![[note]] rendering the target's content).
// Inline content is HTML-escaped first, so the only markup ever injected is the
// fixed set of tags below.
import katex from "katex";
import { isHex } from "../theme/colorEngine";
import {
  parseIdTargets,
  parseIdSlots,
  splitRawSegments,
  unescapeSegment,
  wikilinkDisplaySpan,
} from "../graph/wikilinkParse";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

// The rendered HTML for one note link, from RAW (unescaped) source text.
//
// The attribute contract is byte-identical to the live preview's, because the
// same hover/click code reads both (editor/wikilinkInteractions):
//   • data-wikilink  — the raw inner text, always. Titles are how a "_" slot
//     resolves, so this must survive even on a fully-pinned link.
//   • data-note-id   — SLOT 0 only, and only when it is real. Not "the first
//     real id anywhere in the list": on [[Alpha|Beta]](id:_,Y) that would make
//     a click open Beta while the visible label says Alpha, i.e. the rendered
//     copy of a link would open a different note than the editor's copy.
//   • data-link-slots — the whole positional list ("_" included), so a consumer
//     can rebuild every target exactly, sentinels and all.
// Values are escaped for attribute context; ids come out of the slot charset.
function noteLinkSpan(inner: string, slots: (string | null)[] | null): string {
  const slot0 = slots?.[0] ?? null;
  // The label the editor shows: first segment, unescaped, and with a #/^ anchor
  // dropped ONLY when the segment resolves by title (see wikilinkDisplaySpan —
  // a pinned segment's text is a label and may legitimately contain #/^).
  const { start, end } = wikilinkDisplaySpan(inner, !slot0);
  const label = unescapeSegment(inner.slice(start, end)) || unescapeSegment(inner);
  const attrs = [`data-wikilink="${escapeHtml(inner)}"`];
  if (slot0) attrs.push(`data-note-id="${slot0}"`);
  if (slots) attrs.push(`data-link-slots="${slots.map((s) => s ?? "_").join(",")}"`);
  return `<span class="cm-wikilink" ${attrs.join(" ")}>${escapeHtml(label)}</span>`;
}

function renderMath(src: string, block: boolean): string {
  try {
    return katex.renderToString(src, { displayMode: block, throwOnError: false });
  } catch {
    return escapeHtml(src);
  }
}

// Inline markdown → HTML (bold/italic/code/strike/highlight/links/wikilinks/
// images/inline math). Wikilinks keep data-wikilink so the app-wide hover/click
// handlers work inside rendered content too.
export function renderInline(raw: string): string {
  // ── Two-phase render ────────────────────────────────────────────────────────
  // Every construct that either (a) must stay VERBATIM or (b) injects markup of
  // its own is lifted out of the text FIRST, replaced by a null-byte
  // placeholder, and swapped back only after the remaining passes have run.
  //
  // This is not tidiness; it is the only way the later passes can be correct.
  // They are plain regexes over one accumulated string, so anything already
  // injected is in their line of fire: the italic pass rewrites *big* inside a
  // data-wikilink="my *big* idea" attribute (making a click create a note named
  // "em idea"), the __ pass injects <strong> into a data-href URL, and both
  // rewrite the inside of a <code> span that is supposed to be literal.
  //
  // Lifting BEFORE escapeHtml is equally load-bearing for labels: computing a
  // label from already-escaped text means an apostrophe arrives as "&#39;" and
  // the #-anchor drop truncates the label at the "#" inside that entity —
  // "Bob's note" renders as "Bob&". Here every label is sliced from raw text and
  // escaped once, at the end, as element content.
  const slots: string[] = [];
  const ph = (html: string) => {
    slots.push(html);
    return `\0${slots.length - 1}\0`;
  };

  // 1. Inline code — verbatim by definition, so it goes first and nothing else
  //    ever sees its body.
  raw = raw.replace(/`([^`]+)`/g, (_m, c: string) => ph(`<code class="cm-inline-code">${escapeHtml(c)}</code>`));
  // 2. Math ($$…$$ before $…$, so the inline rule can't half-match the double
  //    delimiters). KaTeX emits a whole tree of markup — prime corruption bait.
  raw = raw.replace(/\$\$([^$]+?)\$\$/g, (_m, src: string) => ph(renderMath(src, true)));
  raw = raw.replace(/\$([^$\n]+?)\$/g, (_m, src: string) => ph(renderMath(src, false)));
  // 3. Images, then embeds — both start "![", and the image regex needs a "("
  //    so it can never claim an ![[embed]].
  raw = raw.replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (_m, a: string, u: string) =>
    ph(`<img class="cm-md-image" src="${escapeHtml(u)}" alt="${escapeHtml(a)}"/>`),
  );
  raw = raw.replace(/!\[\[((?:\\.|[^\\\]\n])+)\]\]/g, (_m, inner: string) => {
    const label = unescapeSegment(splitRawSegments(inner)[0].raw).trim() || unescapeSegment(inner);
    return ph(`<span class="cm-embed">⧉ ${escapeHtml(label)}</span>`);
  });
  // 4. Compound note links BEFORE the bare pass, or [[A]] would match and leave
  //    the "(id:…)" tail behind as visible text. A malformed slot list is left
  //    alone (it is not a note link — the same verdict noteLinkParts and the
  //    graph reach), so it falls through to the passes below as ordinary text.
  raw = raw.replace(
    /\[\[((?:\\.|[^\\\]\n])+)\]\]\((id:[A-Za-z0-9_,]+)\)/g,
    (m, inner: string, dest: string) => {
      const parsed = parseIdSlots(dest);
      return parsed.length ? ph(noteLinkSpan(inner, parsed)) : m;
    },
  );
  raw = raw.replace(/\[\[((?:\\.|[^\\\]\n])+)\]\]/g, (_m, inner: string) =>
    ph(noteLinkSpan(inner, null)),
  );
  // 5. Legacy [display](id:X) — read-only compat, before the generic URL pass
  //    or that would claim it. The "!" guard mirrors the grammar's legacyScan:
  //    "![x](id:y)" is an image, not a note link.
  raw = raw.replace(
    /(?<!!)\[([^\]\n]+)\]\(\s*(id:[A-Za-z0-9,]+)\s*\)/g,
    (m, t: string, dest: string) => {
      const ids = parseIdTargets(dest);
      if (!ids.length) return m;
      // The old form escaped only "[" in its display; undo that for display.
      const label = t.replace(/\\\[/g, "[");
      return ph(
        `<span class="cm-wikilink" data-note-id="${ids[0]}" data-note-ids="${ids.join(",")}">${escapeHtml(label)}</span>`,
      );
    },
  );
  // 6. Ordinary [text](url) links. data-href lets the click handlers open them
  //    from rendered content too — table cells route it via the cell's own
  //    mousedown listener, editor content via externalLinkInteractions.
  raw = raw.replace(
    /\[([^\]\n]+)\]\(([^)\n]+)\)/g,
    (_m, t: string, u: string) =>
      ph(`<span class="cm-link" data-href="${escapeHtml(u)}">${escapeHtml(t)}</span>`),
  );
  // 7. Bare URL literals ("https://…", "www.…" — no [text](url) wrapper). Every
  //    wrapped destination and every code span is already a placeholder by now,
  //    so this can no longer match inside one and needs no lookbehind or
  //    code-span exclusion of its own.
  raw = raw.replace(/\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi, (m) => {
    // Walk trailing sentence punctuation (and an unopened ")") off the match —
    // the same trim @lezer/markdown's own bare-URL autolinker applies — so
    // "see https://x.com." links to x.com, not x.com.
    let end = m.length;
    for (;;) {
      const last = m[end - 1];
      if (/[?!.,:*_~]/.test(last)) end--;
      else if (
        last === ")" &&
        (m.slice(0, end).match(/\(/g)?.length ?? 0) < (m.slice(0, end).match(/\)/g)?.length ?? 0)
      )
        end--;
      else break;
    }
    const url = m.slice(0, end);
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    return (
      ph(`<span class="cm-link" data-href="${escapeHtml(href)}">${escapeHtml(url)}</span>`) +
      m.slice(end)
    );
  });

  let h = escapeHtml(raw);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  h = h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  h = h.replace(/~~([^~]+)~~/g, '<span class="cm-strike">$1</span>');
  h = h.replace(/==([^=]+)==/g, '<span class="cm-highlight">$1</span>');
  // <mark style="background:#hex">…</mark> — the colour-highlight encoding
  // (editor/highlight.ts is the only place that writes either form). Matches
  // the ESCAPED form since escapeHtml() already ran above, and — same rule as
  // the live preview's version of this — only a hex that passes isHex is ever
  // trusted into the `style` attribute; raw note text must never reach it.
  // Placed after **bold**/*italic* so formatting nested inside a highlight
  // (already converted to <strong>/<em> by the replacements above) still
  // renders instead of being swallowed as plain text.
  h = h.replace(
    /&lt;mark(?:\s+style=&quot;background:\s*(#[0-9a-fA-F]{3,8})\s*;?&quot;)?&gt;([\s\S]*?)&lt;\/mark&gt;/g,
    (_m, hex, inner) => {
      const safeHex = hex && isHex(hex) ? hex : null;
      return `<span class="cm-highlight"${safeHex ? ` style="background-color:${safeHex}"` : ""}>${inner}</span>`;
    },
  );
  // Swap every lifted construct back in last, once the text around it is
  // finished HTML — this is the half that makes phase one worth doing.
  h = h.replace(/\0(\d+)\0/g, (_m, i) => slots[Number(i)]);
  return h;
}

// Split a table row into trimmed cells (outer pipes stripped).
export function splitRow(rawLine: string): string[] {
  let parts = rawLine.split("|");
  if (/^\s*\|/.test(rawLine)) parts = parts.slice(1);
  if (/\|\s*$/.test(rawLine)) parts = parts.slice(0, -1);
  return parts.map((p) => p.trim());
}

function stripFrontmatter(text: string): string {
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

// Block-level markdown → DOM for embedded (transcluded) notes. Covers the same
// syntax set the live preview renders: headings, lists (incl. tasks), quotes/
// callouts, fenced code, tables, block math, HR, paragraphs. Nested embeds are
// left as chips by renderInline — one level deep, like a cycle-guard.
export function renderMarkdownBlocks(text: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "md-render";
  const lines = stripFrontmatter(text).split("\n");
  let i = 0;

  const flushPara = (buf: string[]) => {
    if (!buf.length) return;
    const p = document.createElement("p");
    p.innerHTML = renderInline(buf.join(" "));
    root.appendChild(p);
    buf.length = 0;
  };

  const para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (t === "") {
      flushPara(para);
      i++;
      continue;
    }

    // Fenced code
    const fence = /^```(\w*)/.exec(t);
    if (fence) {
      flushPara(para);
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      i++; // closing fence
      const pre = document.createElement("pre");
      pre.className = "md-code";
      pre.textContent = body.join("\n");
      root.appendChild(pre);
      continue;
    }

    // Block math — single-line $$…$$ form
    const singleMath = /^\$\$(.+?)\$\$$/.exec(t);
    if (singleMath && singleMath[1].trim()) {
      flushPara(para);
      const el = document.createElement("div");
      el.className = "cm-math cm-math-block";
      try {
        katex.render(singleMath[1], el, { displayMode: true, throwOnError: false });
      } catch {
        el.textContent = singleMath[1];
      }
      root.appendChild(el);
      i++;
      continue;
    }

    // Block math
    if (t === "$$") {
      flushPara(para);
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "$$") body.push(lines[i++]);
      i++;
      const el = document.createElement("div");
      el.className = "cm-math cm-math-block";
      try {
        katex.render(body.join("\n"), el, { displayMode: true, throwOnError: false });
      } catch {
        el.textContent = body.join("\n");
      }
      root.appendChild(el);
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      flushPara(para);
      const el = document.createElement("h" + h[1].length);
      el.innerHTML = renderInline(h[2]);
      root.appendChild(el);
      i++;
      continue;
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara(para);
      root.appendChild(document.createElement("hr"));
      i++;
      continue;
    }

    // Blockquote / callout (flat)
    if (t.startsWith(">")) {
      flushPara(para);
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        body.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const bq = document.createElement("blockquote");
      bq.innerHTML = body.map(renderInline).join("<br/>");
      root.appendChild(bq);
      continue;
    }

    // Table
    if (t.startsWith("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      flushPara(para);
      const header = splitRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      const table = document.createElement("table");
      table.className = "cm-table";
      const thead = document.createElement("thead");
      const htr = document.createElement("tr");
      for (const c of header) {
        const th = document.createElement("th");
        th.innerHTML = renderInline(c);
        htr.appendChild(th);
      }
      thead.appendChild(htr);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      for (const r of rows) {
        const tr = document.createElement("tr");
        for (const c of r) {
          const td = document.createElement("td");
          td.innerHTML = renderInline(c);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      const wrap = document.createElement("div");
      wrap.className = "cm-table-wrap";
      wrap.appendChild(table);
      root.appendChild(wrap);
      continue;
    }

    // List block (bullets, ordered, tasks; nesting via indent)
    if (/^[\t ]*([-*+]|\d+[.)])\s/.test(line)) {
      flushPara(para);
      const items: { indent: number; ordered: boolean; html: string; task: string | null }[] = [];
      while (i < lines.length && /^[\t ]*([-*+]|\d+[.)])\s/.test(lines[i])) {
        const raw = lines[i];
        const indent = /^[\t ]*/.exec(raw)![0].replace(/\t/g, "  ").length;
        const ordered = /^\s*\d+[.)]\s/.test(raw);
        let content = raw.replace(/^[\t ]*([-*+]|\d+[.)])\s+/, "");
        let task: string | null = null;
        const tm = /^\[(.)\]\s+/.exec(content);
        if (tm) {
          task = tm[1];
          content = content.slice(tm[0].length);
        }
        items.push({ indent, ordered, html: renderInline(content), task });
        i++;
      }
      // Build nested lists off an indent stack.
      const rootList = document.createElement(items[0].ordered ? "ol" : "ul");
      root.appendChild(rootList);
      const stack: { indent: number; list: HTMLElement }[] = [{ indent: items[0].indent, list: rootList }];
      let lastLi: HTMLElement | null = null;
      for (const it of items) {
        while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) stack.pop();
        if (it.indent > stack[stack.length - 1].indent && lastLi) {
          const sub = document.createElement(it.ordered ? "ol" : "ul");
          lastLi.appendChild(sub);
          stack.push({ indent: it.indent, list: sub });
        }
        const li = document.createElement("li");
        if (it.task !== null) {
          const box = document.createElement("input");
          box.type = "checkbox";
          box.className = "cm-task";
          box.checked = /x/i.test(it.task);
          box.disabled = true;
          li.appendChild(box);
        }
        const span = document.createElement("span");
        span.innerHTML = it.html;
        li.appendChild(span);
        stack[stack.length - 1].list.appendChild(li);
        lastLi = li;
      }
      continue;
    }

    para.push(t);
    i++;
  }
  flushPara(para);
  return root;
}
