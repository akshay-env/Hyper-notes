import { type MarkdownConfig, InlineContext } from "@lezer/markdown";

export const ObsidianMarkdownExtension: MarkdownConfig = {
  defineNodes: ["Wikilink", "WikilinkMark", "WikilinkPath", "WikilinkText", "Embed", "EmbedMark", "Tag", "TagMark", "Callout", "CalloutMark", "CalloutType", "CalloutTitle"],
  parseInline: [
    {
      name: "Wikilink",
      parse(cx: InlineContext, next: number, pos: number) {
        // Embeds must be claimed AT the '!' — the built-in Image parser also
        // fires on "![" and would otherwise consume it before we ever see the
        // inner "[[" (leaving ![[x]] parsed as Image>Link, never as Embed).
        const isEmbed =
          next === 33 /* '!' */ && cx.char(pos + 1) === 91 /* '[' */ && cx.char(pos + 2) === 91;
        if (!isEmbed && (next !== 91 /* '[' */ || cx.char(pos + 1) !== 91)) return -1;
        const open = isEmbed ? pos + 1 : pos; // first '[' of "[["

        let end = -1;
        for (let i = open + 2; i < cx.end; i++) {
          if (cx.char(i) === 93 /* ']' */ && cx.char(i + 1) === 93 /* ']' */) {
            end = i;
            break;
          }
        }
        if (end === -1 || end === open + 2) return -1; // unclosed or empty [[]]

        // Find pipe for alias
        let pipePos = -1;
        for (let i = open + 2; i < end; i++) {
          if (cx.char(i) === 124 /* '|' */) {
            pipePos = i;
            break;
          }
        }

        const nodeType = isEmbed ? "Embed" : "Wikilink";
        const markName = isEmbed ? "EmbedMark" : "WikilinkMark";
        const elts = [cx.elt(markName, pos, open + 2)];

        if (pipePos !== -1) {
          elts.push(cx.elt("WikilinkPath", open + 2, pipePos));
          elts.push(cx.elt("WikilinkText", pipePos + 1, end));
        } else {
          elts.push(cx.elt("WikilinkPath", open + 2, end));
        }

        elts.push(cx.elt(markName, end, end + 2));

        return cx.addElement(cx.elt(nodeType, pos, end + 2, elts));
      },
      before: "Link"
    },
    {
      // "[!type]" (optionally "[!type]-" / "[!type]+") at the head of a
      // blockquote line — tokenized natively so callouts live in the syntax
      // tree like every other Obsidian construct.
      name: "Callout",
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 91 /* '[' */ || cx.char(pos + 1) !== 33 /* '!' */) return -1;
        // Only at the very head of the inline section — i.e. "> [!…]" right
        // after the quote marker. (cx.char can't see the "> " itself; the
        // section starts at the content, so this is the head-of-quote test.)
        if (pos !== cx.offset) return -1;
        let i = pos + 2;
        while (i < cx.end) {
          const c = cx.char(i);
          if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) i++;
          else break;
        }
        if (i === pos + 2 || cx.char(i) !== 93 /* ']' */) return -1;
        const typeEnd = i;
        let end = i + 1;
        const suffix = cx.char(end);
        if (suffix === 45 /* '-' */ || suffix === 43 /* '+' */) end++;
        // "[!text](url)" at a paragraph head is a link, not a callout.
        if (cx.char(end) === 40 /* '(' */) return -1;
        return cx.addElement(
          cx.elt("Callout", pos, end, [
            cx.elt("CalloutMark", pos, pos + 2),
            cx.elt("CalloutType", pos + 2, typeEnd),
            cx.elt("CalloutMark", typeEnd, end),
          ]),
        );
      },
      before: "Link"
    },
    {
      name: "Tag",
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 35 /* '#' */) return -1;
        
        // Tag must be at start of line or after whitespace
        if (pos > 0) {
          const prev = cx.char(pos - 1);
          if (prev !== 32 && prev !== 9 && prev !== 10 && prev !== 13) return -1;
        }

        let end = pos + 1;
        while (end < cx.end) {
          const c = cx.char(end);
          // Alphanumeric, hyphen, underscore, slash
          if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 95 || c === 47) {
            end++;
          } else {
            break;
          }
        }
        
        if (end === pos + 1) return -1; // # by itself is not a tag
        // Must contain at least one non-number character
        let hasLetters = false;
        for (let i = pos + 1; i < end; i++) {
          const c = cx.char(i);
          if (c < 48 || c > 57) {
            hasLetters = true;
            break;
          }
        }
        if (!hasLetters) return -1;

        return cx.addElement(cx.elt("Tag", pos, end, [
          cx.elt("TagMark", pos, pos + 1)
        ]));
      },
      before: "Link"
    }
  ]
};
