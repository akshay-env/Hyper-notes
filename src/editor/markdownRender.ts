// Shared markdown → HTML rendering, used by table cells in the live preview
// and by embed transclusion (![[note]] rendering the target's content).
// Inline content is HTML-escaped first, so the only markup ever injected is the
// fixed set of tags below.
import katex from "katex";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

// Inline markdown → HTML (bold/italic/code/strike/highlight/links/wikilinks/
// images/inline math). Wikilinks keep data-wikilink so the app-wide hover/click
// handlers work inside rendered content too.
export function renderInline(raw: string): string {
  let h = escapeHtml(raw);
  h = h.replace(/`([^`]+)`/g, (_m, c) => `<code class="cm-inline-code">${c}</code>`);
  // $$…$$ before single-$: display math, and keeps the inline rule from
  // half-matching the double delimiters.
  h = h.replace(/\$\$([^$]+?)\$\$/g, (_m, src) => {
    try {
      return katex.renderToString(src, { displayMode: true, throwOnError: false });
    } catch {
      return escapeHtml(src);
    }
  });
  h = h.replace(/\$([^$\n]+?)\$/g, (_m, src) => {
    try {
      return katex.renderToString(src, { throwOnError: false });
    } catch {
      return escapeHtml(src);
    }
  });
  h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, a, u) => `<img class="cm-md-image" src="${u}" alt="${a}"/>`);
  h = h.replace(/!\[\[([^\]]+)\]\]/g, (_m, inner) => {
    const label = (inner.split("|")[0] || inner).trim();
    return `<span class="cm-embed">⧉ ${label}</span>`;
  });
  h = h.replace(/\[\[([^\]]+)\]\]/g, (_m, inner) => {
    const label = (inner.split("|")[0] || inner).replace(/[#^].*$/, "") || inner;
    return `<span class="cm-wikilink" data-wikilink="${inner}">${label}</span>`;
  });
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t) => `<span class="cm-link">${t}</span>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  h = h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  h = h.replace(/~~([^~]+)~~/g, '<span class="cm-strike">$1</span>');
  h = h.replace(/==([^=]+)==/g, '<span class="cm-highlight">$1</span>');
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
