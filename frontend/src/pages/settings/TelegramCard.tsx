import { ExternalLink, MessageCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, Skeleton } from "../../components/ui";
import { timeAgo } from "../../lib/format";
import { expiresIn } from "../../lib/settings";
import type { Profile } from "../../lib/types";
import { useTelegramLink, useTelegramStatus, type LinkCode, type TelegramStatus } from "./hooks";

function NotConfigured() {
  return (
    <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3.5 text-xs leading-relaxed text-muted">
      <p className="font-medium text-yellow-100">Telegram is not configured on this server.</p>
      <p className="mt-1">
        Create a bot with <b>@BotFather</b>, then set <code className="text-cyan">TELEGRAM_BOT_TOKEN</code> (and{" "}
        <code className="text-cyan">TELEGRAM_MODE</code>=polling locally or webhook with{" "}
        <code className="text-cyan">TELEGRAM_WEBHOOK_SECRET</code> and <code className="text-cyan">PUBLIC_BASE_URL</code> in production) in
        the backend environment and restart.
      </p>
    </div>
  );
}

function LinkInstructions({ code }: { code: LinkCode }) {
  return (
    <div className="mt-2 space-y-2">
      {code.deep_link ? (
        <a
          href={code.deep_link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan/15 px-3 py-1.5 text-cyan hover:bg-cyan/25"
        >
          Open Telegram to link <span className="sr-only">(opens in a new tab)</span>
          <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </a>
      ) : (
        <p>
          Send <code className="text-cyan">/start {code.code}</code> to the bot.
        </p>
      )}
      <p className="text-faint">Code expires {expiresIn(timeAgo(code.expires_at))}. Refresh this page after linking.</p>
    </div>
  );
}

function AccountLink({ profile }: { profile: Profile }) {
  const { code, unlink } = useTelegramLink();
  if (profile.telegram)
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald/25 bg-emerald/5 p-3 text-xs">
        <span>
          Linked{profile.telegram.username ? ` as @${profile.telegram.username}` : ""} · {timeAgo(profile.telegram.linked_at)}
        </span>
        <Button size="sm" variant="ghost" onClick={() => unlink.mutate()} loading={unlink.isPending}>
          Unlink
        </Button>
      </div>
    );
  return (
    <div className="rounded-xl border hairline bg-black/15 p-3 text-xs">
      <p className="text-muted">Link your account to get alerts in a private chat with the bot.</p>
      {code.data ? (
        <LinkInstructions code={code.data} />
      ) : (
        <Button className="mt-2" size="sm" variant="ai" loading={code.isPending} onClick={() => code.mutate()}>
          Generate link
        </Button>
      )}
    </div>
  );
}

function Configured({ status: s, profile }: { status: TelegramStatus; profile: Profile }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge color={s.connected ? "#35D399" : "#FB923C"} dot>
          {s.connected ? "Bot connected" : "Bot unreachable"}
        </Badge>
        {s.bot_username && <span className="text-muted">@{s.bot_username}</span>}
        {s.mode && <span className="text-faint">mode: {s.mode}</span>}
        {s.error && <span className="text-orange-300">{s.error}</span>}
      </div>
      <AccountLink profile={profile} />
      <div className="rounded-xl border hairline bg-black/15 p-3 text-[11px] leading-relaxed text-muted">
        <p className="font-medium text-ink">Groups</p>
        <p className="mt-1">
          Add the bot to a school or society group. A group admin sends <code className="text-cyan">/optin</code>; until then every message
          is ignored. Use <code className="text-cyan">/setlocation</code> to set the area and connect the group on the Community page with
          the code the bot returns.
        </p>
        <p className="mt-1 text-faint">{s.privacy_note}</p>
      </div>
    </div>
  );
}

export function TelegramCard({ profile }: { profile: Profile }) {
  const status = useTelegramStatus();
  const s = status.data;
  return (
    <Card hover={false}>
      <CardHeader
        icon={<MessageCircle aria-hidden="true" className="h-4 w-4 text-cyan" />}
        title="Telegram connection"
        subtitle="Receive alerts without opening AIRenv, and enable Conversation Intelligence in groups"
      />
      {status.isLoading ? (
        <Skeleton className="h-20" label="Checking Telegram status…" />
      ) : !s?.configured ? (
        <NotConfigured />
      ) : (
        <Configured status={s} profile={profile} />
      )}
    </Card>
  );
}
