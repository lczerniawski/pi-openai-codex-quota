import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { formatQuota, parseQuota, renderBar, type Quota, type QuotaWindow } from "./quota.ts";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const ENTRY_TYPE = "openai-usage";

interface CodexAuth {
  auth_mode?: string;
  tokens?: { access_token?: string; account_id?: string };
}

async function readCodexAuth(): Promise<{ token: string; accountId?: string }> {
  const path = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json");
  let auth: CodexAuth;
  try {
    auth = JSON.parse(await readFile(path, "utf8")) as CodexAuth;
  } catch {
    throw new Error("Codex login not found. Run `codex login`, then try /usage again.");
  }
  if (auth.auth_mode !== "chatgpt" || !auth.tokens?.access_token) {
    throw new Error("Codex ChatGPT login not found. Run `codex login`, then try /usage again.");
  }
  return { token: auth.tokens.access_token, accountId: auth.tokens.account_id };
}

export default function openaiUsage(pi: ExtensionAPI) {
  // Custom entries render in scrollback but never enter the model's context.
  pi.registerEntryRenderer<Quota>(ENTRY_TYPE, (entry, _options, theme) => {
    const quota = entry.data;
    if (!quota) return undefined;
    return {
      render(width: number): string[] {
        if (width < 1) return [];
        const line = (text: string) => truncateToWidth(text, width);
        const rows: string[] = [
          line(theme.fg("accent", theme.bold("  OpenAI Codex quota"))),
          "",
        ];
        const addWindow = (label: string, value?: QuotaWindow) => {
          if (!value) {
            rows.push(line(`  ${label}: ${theme.fg("muted", "not reported by OpenAI")}`), "");
            return;
          }
          const percent = `${Number(value.remainingPercent.toFixed(1))}% left`;
          rows.push(line(`  ${theme.bold(label)}  ${percent}`));
          const bar = renderBar(value.remainingPercent, Math.min(32, Math.max(0, width - 6)));
          const color = value.remainingPercent <= 15 ? "error" : value.remainingPercent <= 40 ? "warning" : "success";
          rows.push(line(`  [${theme.fg(color, bar.filled)}${theme.fg("dim", bar.empty)}]`));
          if (value.resetAt) rows.push(line(theme.fg("muted", `  Resets ${new Date(value.resetAt).toLocaleString()}`)));
          rows.push("");
        };
        addWindow("5-hour", quota.fiveHour);
        addWindow("Weekly", quota.weekly);
        return rows;
      },
      invalidate() { },
    };
  });

  pi.registerCommand("usage", {
    description: "Show remaining OpenAI Codex 5-hour and weekly quota",
    handler: async (_args, ctx) => {
      try {
        // Pi's `openai` OAuth token is scoped to api.openai.com and gets a 401 here.
        // Read Codex CLI's separate credential on each invocation; never copy or refresh it.
        const { token, accountId } = await readCodexAuth();
        const response = await fetch(USAGE_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error("Codex login expired or cannot access usage. Run `codex login`, then retry.");
        }
        if (!response.ok) throw new Error(`OpenAI usage request failed (HTTP ${response.status}).`);
        const quota = parseQuota(await response.json());
        if (ctx.mode === "tui") ctx.ui.setWidget(ENTRY_TYPE, undefined); // Clear an older widget after /reload.
        pi.appendEntry<Quota>(ENTRY_TYPE, quota);
        if (ctx.mode !== "tui") ctx.ui.notify(formatQuota(quota), "info");
      } catch (error) {
        // Avoid displaying response bodies or credentials in errors.
        ctx.ui.notify(error instanceof Error && error.name === "TimeoutError"
          ? "OpenAI usage request timed out. Try /usage again."
          : error instanceof Error && (error.message.startsWith("Codex ") || error.message.startsWith("OpenAI "))
            ? error.message
            : "Could not fetch OpenAI usage. Check your connection and try again.", "error");
      }
    },
  });
}
