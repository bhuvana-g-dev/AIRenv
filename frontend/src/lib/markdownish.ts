export interface Segment {
  text: string;
  bold: boolean;
}

/** Paragraphs → lines → inline segments. */
export type MarkdownishDoc = Segment[][][];

/**
 * Minimal, safe markdown for assistant answers: blank lines split paragraphs, single newlines
 * are line breaks, `**text**` is bold and a leading "- " / "* " becomes a bullet. The output is
 * plain data rendered as React text, so no HTML can be injected.
 */
export function parseMarkdownish(text: string): MarkdownishDoc {
  return text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) =>
          line
            .split(/(\*\*[^*]+\*\*)/g)
            .map((seg) =>
              seg.startsWith("**") && seg.endsWith("**")
                ? { text: seg.slice(2, -2), bold: true }
                : { text: seg.replace(/^[-*] /, "• "), bold: false },
            ),
        ),
    );
}
