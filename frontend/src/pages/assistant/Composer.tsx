import { Send } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Button } from "../../components/ui";

/** Message input: Enter sends, Shift+Enter adds a new line. */
export function Composer({
  value,
  onChange,
  onSend,
  pending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  pending: boolean;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="border-t hairline bg-bg-2/60 p-3 md:p-4"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={600}
          placeholder="Ask about today's air, timing, indoor air, or community actions…"
          className="input max-h-32 min-h-[44px] resize-none"
          aria-label="Message AIRenv AI"
        />
        <Button
          type="submit"
          variant="ai"
          className="h-11 w-11 shrink-0 !px-0"
          disabled={!value.trim()}
          loading={pending}
          aria-label="Send message"
        >
          {!pending && <Send aria-hidden="true" className="h-4 w-4" />}
        </Button>
      </div>
      <p className="mt-2 text-[10px] text-faint">
        Conversation history is stored only in this browser. AIRenv AI gives general guidance, not medical advice.
      </p>
    </form>
  );
}
