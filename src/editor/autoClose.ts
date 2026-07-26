// Auto-closing brackets and quotes — CodeMirror's own closeBrackets(), tuned
// for prose instead of for code, and reconciled with the "[" wikilink shortcut.
//
// The two never actually race, which is the whole reason this is safe:
// linkShortcuts binds "[" / "]" as KEY bindings, and a keymap runs on keydown
// and preventDefaults the event the moment a binding returns true, whereas
// closeBrackets() is an EditorView.inputHandler — it only ever sees the text
// insertion that a keydown nobody claimed goes on to produce. So a selection is
// always wrapped in [[…]] by the shortcut and never reaches auto-close, while
// an empty selection makes the shortcut return false and hands the "[" straight
// down to the input handler. No ordering inside keymap.of([…]) can change that;
// only the Backspace binding below is ordered against anything.
//
// What that composition buys for the app's primary syntax: "[" on an empty
// selection closes to "[|]", and a second "[" closes again — the "]" sitting
// ahead of the caret is in the `before` set, so it doesn't veto the pair —
// landing on "[[|]]", which is exactly the wikilink skeleton and is enough for
// wikilinkComplete to pop its title list. Typing the closing "]]" back out
// types OVER the auto-inserted pair rather than doubling it, because
// closeBrackets tracks the positions of brackets it inserted itself and only
// skips those; and wikilinkComplete's applyTitle already checks for a "]]" it
// doesn't need to insert, so picking a completion out of an auto-closed link
// yields "[[Note]]" and not "[[Note]]]]".
import { closeBrackets, closeBracketsKeymap, type CloseBracketConfig } from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";

// Which pairs close while writing markdown. Deliberately not CM's default set:
//
//   - "'" is dropped. In a notes app it is overwhelmingly an apostrophe — "the
//     vault's notes", "don't" — and closing it fights the user on every
//     contraction. It still closes inside a fenced code block, where it really
//     is a quote, because that block resolves to its own language's config.
//   - "`" is added, for inline code. A fence still types out as a plain "```"
//     at the start of a line: the second backtick types over the auto-closed
//     one, and the third is declined because the line already reads as an
//     opening run.
//   - "*", "_" and "**" (markdown emphasis) are deliberately absent. "* "
//     opens a bullet and "_" lives inside snake_case words, so closing them
//     would fire constantly where it is wrong; and a two-character token like
//     "**" could never match anyway, since the input handler is fed one typed
//     character at a time.
// `satisfies` rather than a bare object: the config is read back out of language data
// as an untyped record, so a mistyped key ("bracket", "beforeChars") would not fail —
// it would silently fall through to CM's DEFAULT config and quietly re-enable
// apostrophe closing. This turns that whole class of typo into a compile error.
const markdownCloseBrackets = {
  brackets: ["(", "[", "{", '"', "`"],
  // Only consulted for the ASYMMETRIC pairs — ( [ { — where CM checks what follows
  // the caret before closing, so "(" in front of a word doesn't orphan a ")" behind
  // it. CM's default list is code punctuation; prose also ends clauses with commas
  // and sentence enders, and "(an aside)" tucked in before a full stop is common
  // enough to be worth the extra characters. The symmetric pairs (" and `) ignore
  // this entirely and use their own rule — close unless the next character is a word
  // character — so nothing here affects them.
  before: ")]}:;>,.!?\"'",
} satisfies CloseBracketConfig;

// Provided as language data rather than globally: every markdown Language built
// by lang-markdown shares one data facet, so configuring markdownLanguage here
// also configures the markdown() instance createEditorState actually builds —
// while a fenced code block resolves to the NESTED language's own closeBrackets
// config, which is what you want (JavaScript should get its apostrophes closed).
export const autoClose: Extension = [
  markdownLanguage.data.of({ closeBrackets: markdownCloseBrackets }),
  closeBrackets(),
];

// Backspace with the caret between the two halves of a pair deletes both. This
// is the only key closeBrackets binds — everything else it does is input
// handling — and it must sit AFTER markdownKeymap (whose Backspace unwinds list
// and quote markup, and which declines everywhere this one applies) but BEFORE
// defaultKeymap, whose Backspace deletes a character and never declines.
export const autoCloseKeymap: KeyBinding[] = [...closeBracketsKeymap];
