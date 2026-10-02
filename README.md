# pi-openai-codex-quota

Run `/usage` in Pi to see how much of your 5-hour and weekly Codex quota is left, with progress bars and reset times. The snapshot stays in the conversation scrollback; run `/usage` again to update it. In non-interactive mode, Pi shows a text notification instead.

## Install

You need Pi on Node.js 22.19+ and a ChatGPT login in OpenAI's Codex CLI:

```sh
codex login
```

Once the package is published to npm, install it with:

```sh
pi install npm:pi-openai-codex-quota
```

Restart Pi or run `/reload`. If you already have a copy at `~/.pi/agent/extensions/openai-usage`, remove it before installing the package so `/usage` is not registered twice.

## Authentication and privacy

Pi's `openai` Sign in with ChatGPT token works with `api.openai.com` but gets HTTP 401 from the Codex quota endpoint. This extension reads the Codex CLI credential from `${CODEX_HOME:-~/.codex}/auth.json` each time you run `/usage`. It does not log in, refresh the credential, change Pi's model, or copy the token into Pi's auth store. If the credential is missing or expired, run `codex login` again. The quota shown is for the Codex CLI account, which may differ from your Pi account.

The extension sends the token to `https://chatgpt.com/backend-api/wham/usage` over HTTPS. It saves quota snapshots in Pi's scrollback, not in model context, and does not display credentials or response bodies. The endpoint is undocumented and may change. If OpenAI omits a quota window, `/usage` shows “not reported” rather than assuming you have 100% left. You can also check [ChatGPT Settings → Usage](https://chatgpt.com/settings/usage).

## Manual installation and development

To install manually:

```sh
pi install /path/to/pi-openai-codex-quota
# Or for one invocation:
pi -e /path/to/pi-openai-codex-quota
```

For a manual install, copy `index.ts` and `quota.ts` into `~/.pi/agent/extensions/openai-usage/`. Pi loads `index.ts` automatically. Run `/reload` after changing either file. Pick one install method so `/usage` is not registered twice.

Run `npm test` for the quota parser and progress bars, and `npm pack --dry-run` to inspect the package contents. When you are ready to publish, run `npm publish`. Check that the package name is still available first.

MIT license.
