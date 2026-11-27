import { Fragment } from "react";
import { parseMarkdownish } from "../../lib/markdownish";

/** Renders assistant text with paragraphs, line breaks and bold. No HTML injection. */
export function Markdownish({ text }: { text: string }) {
  return (
    <>
      {parseMarkdownish(text).map((lines, i) => (
        <p key={i} className="mb-2 last:mb-0">
          {lines.map((segments, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {segments.map((seg, k) =>
                seg.bold ? (
                  <strong key={k} className="font-semibold text-ink">
                    {seg.text}
                  </strong>
                ) : (
                  <Fragment key={k}>{seg.text}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}
