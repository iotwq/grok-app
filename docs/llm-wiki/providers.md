# Custom providers & agent profile

Product rules for **OpenAI-compatible relays** (CPA / sub2api / OneAPI / self-hosted) and how they reach Grok Build.

## Agent transport (shared with Grok Desktop)

Both Grok App and community **Grok Desktop** drive intelligence the same way:

| Layer | Implementation |
|-------|----------------|
| Runtime | App-bundled **Grok Build** (`grok-build`), updated with the desktop package |
| Entry | `grok agent stdio` |
| Protocol | **ACP** (Agent Client Protocol) JSON-RPC over stdio |
| Client | Desktop Host (`AcpClient`) — **not** a reimplemented agent brain |

Desktop never reimplements tools/sampling. It is an ACP client + UI shell.

## Agent profile (`GROK_HOME`)

| Session data mode | `GROK_HOME` for spawned agent |
|-------------------|-------------------------------|
| `shared` (default) | `~/.grok` (same home as terminal Grok Build CLI) |
| `independent` | `~/.grok-app/agent-home` (or `$GROK_APP_HOME/agent-home`) |

Custom providers are written to **`$GROK_HOME/config.toml`** as `[model.<id>]` sections so the agent can use `base_url` + `api_key` without OAuth fallback.

### User-wide instructions (`~/.grok/AGENTS.md`)

Local native agents read the user's UTF-8 `~/.grok/AGENTS.md` automatically; no
setting is required. On Windows, `~` resolves to `USERPROFILE` (then `HOME`).
The source is always the real user home, independent of `GROK_APP_HOME`, the
selected provider, or the session-data mode.

- **Shared profile:** Grok Build already loads this file as global instructions.
  The Host leaves the profile untouched and does not inject a duplicate.
- **Independent/custom-provider/official-aux profile:** before opening an ACP
  session, the Host refreshes only its managed
  `$GROK_HOME/rules/grok-app-user-agents.md` from the source. Grok Build's native
  global rules loader combines it with existing profile instructions and trusted
  project rules. The Host does not replace either `AGENTS.md` or the default
  system prompt, and does not apply the session `extra_rules` size clamp.
- Missing or blank source files mean no additional global rules; an old managed
  copy is removed. An unchanged source does not rewrite the copy. Read/write
  failures stop the connection with the affected path instead of silently
  claiming that the rules were loaded. A same-name file without the App-managed
  header is never overwritten or deleted. Rule contents are not logged.
- **When changes take effect:** newly created agent sessions load the current
  file, including sessions opened through a prewarmed process. Existing, parked,
  and resumed sessions retain their runtime instruction snapshot. Start
  a **new chat** after editing the file or to apply this feature to an older
  chat; merely reconnecting a saved chat does not reload its instructions.
- **Remote scope:** SSH, WSL, and TCP ACP agents continue to use their own
  environment's rule files; the Host does not transfer local user instructions
  to a remote agent. Native macOS, Windows, and Linux share the same Host path.

Runtime checks: Grok Build 1.0.34 and 1.0.41 load native `rules/*.md` into actual
ACP inference requests. Neither version included `--rules` content in these requests,
so this feature must not be implemented by merely appending that spawn flag.
The native runtime controls instruction precedence, context limits, and saved
session snapshots; the Host does not rewrite saved agent conversations.

## Provider model (L2)

| Field | Role |
|-------|------|
| `id` | Config section slug (`[model.<id>]`) |
| `name` | Channel display label (provider card / menu group) |
| `baseUrl` | OpenAI-compatible root, usually ends with `/v1` |
| `baseUrlFullPath` | When **true**, host stores the URL as typed and **does not** auto-append `/v1` (App TOML `app_base_url_full_path`). Default **false** = legacy auto-`/v1` for CPA/sub2api. Use for gateways like Volcengine Ark Coding Plan (`…/api/coding`, `…/api/coding/v3`). Settings UI: switch **完整路径 / Full path** next to Base URL label. |
| `apiKey` | Required for custom relay; never returned plaintext to UI |
| `model` | **Active** request body model id (written to config `model = …`) |
| `models` | Multi-model catalog (`[{id, name, contextWindow?, supportsVision?, supportsVideo?, efforts?}]`); App field `app_models` JSON in TOML (ignored by Grok Build). Each entry has request id + **display name** for composer chip. Per-model extras (context window, image/video, reasoning ladder) live here; Settings row **gear** edits them. Live `/models` fills `contextWindow` / modalities when the API advertises them. |
| `efforts` | Channel-level reasoning-effort fallback (`[{id, name, isDefault}]`); App field `app_efforts` JSON. Composer uses the **active model**'s `efforts` when present, else this list. Empty → Grok `low`/`medium`/`high` fallback. Switching models copies the active model's ladder onto `app_efforts` so Grok Build spawn stays unchanged. |
| `contextWindow` | Channel-level token cap → TOML `context_window` as a **bare integer** (never `"1000000"`). Grok Build rejects string type and falls back to 200k (#538). Effective value is the **active model**'s window when set, else this field. Composer can still edit it; upsert writes both the model row and the channel field. Missing → UI chip uses `DEFAULT_CUSTOM_CONTEXT_WINDOW` (200k) only. |
| `apiBackend` | Message format: `responses` (default) \| `chat_completions` \| `messages` |
| `supportsVision` | Channel-level App field `app_supports_vision` (live value for the **active** model). Per-model `supportsVision` / `supportsVideo` in `app_models` win when set. Host `custom_provider_is_text_only` follows the active row, not sibling catalog ids — mixed DeepSeek flash + vision-exp stays text-only on flash. Names / model ids that look like Grok / GPT-4o / Claude / Gemini still count as vision when the per-model flag is unset. Unknown relays stay text-only so DeepSeek-style APIs do not 400 on `image_url`. |
| `extraHeaders` | Extra HTTP headers written as Grok Build `[model.<id>].extra_headers` (inline TOML table, sent verbatim on inference). Settings → Account → Providers editor. Use for gateways that WAF-check `User-Agent` / `Originator` (e.g. AgentRouter) or Anthropic `x-api-key`. Empty = omit the field. Newlines in values are rejected. |
| `providerMode` | Explicit transport semantics: `generic` (default) or `grok_build_proxy`. Never infer this from a provider id or hostname. |
| `isDefault` | Maps to `[models].default` (set only via **Use** / composer pick activate, not a form checkbox) |

**Integer TOML fields:** Host writes `context_window = 1000000` (CLI-compatible). On `providers_list`, legacy quoted string forms are repaired in place. Other model edits must not drop or re-quote this field.

### Presets (add provider)

Add flow opens a **preset gallery** (`providerPresets.ts`):

| Preset | Models | Default efforts |
|--------|--------|-----------------|
| **Custom** | empty (user fills) | Grok `low`/`medium`/`high` |
| **DeepSeek** | `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `deepseek-v4-pro` | `low` / `high` / `xhigh` / `max` (docs mapping table; default `high`) |
| **OpenRouter** | `z-ai/glm-5.3-flash` | GLM `low`/`high`/`max` (default `max`); vision on; `context_window` 1 048 576 |
| **OrcaRouter** | `orcarouter/auto`, `openai/gpt-4o-mini`, `google/gemini-2.5-flash` | Grok `low`/`medium`/`high`/`max` (default `medium`); vision on |
| **Amux** | `grok-4.6` + `grok-4.5` | Official Grok `low`/`medium`/`high`/`xhigh` (default `xhigh`) |
| **Yun API** | `grok-4.6` + `grok-4.5` | Official Grok `low`/`medium`/`high`/`xhigh` (default `xhigh`) |
| **OpenCode Go** | `deepseek-v4-flash`, `deepseek-v4-pro` | DeepSeek efforts (default `high`) |
| **火山方舟** (Volcengine Ark) | `deepseek-v4-flash` | Grok `low`/`medium`/`high`/`max` (default `medium`); **full path** on |
| **AI98PRO** | `grok-4.6` + `grok-4.5` | Official Grok `low`/`medium`/`high`/`xhigh` (default `xhigh`); vision on |
| **智谱** | `glm-5.3-flash` (1M, vision+video, `low`/`high`/`max`) | One gallery chip. Click picks China API / China Coding Plan / international API / international Coding Plan. Form tags above Base URL switch the same four roots. All `chat_completions` + **full path**. Official Z tile (`docs/svg/zhipu.svg`) on list / footer / welcome; sidebar top-left when Replace brand logo is on (dark square + white Z, inverted in dark theme). |

| Preset | Base | Get API Key |
|--------|------|-------------|
| DeepSeek | `https://api.deepseek.com/v1` (`chat_completions`) | https://platform.deepseek.com/ |
| OpenRouter | `https://openrouter.ai/api/v1` (`chat_completions`) | https://openrouter.ai/settings/keys |
| OrcaRouter | `https://api.orcarouter.ai/v1` (`chat_completions`) | https://orcarouter.ai/ |
| Amux | `https://api.amux.ai/v1` (`responses`) | https://api.amux.ai/register?aff=Vccp |
| Yun API | `https://api.yunyi.ai/v1` (`responses`) | https://api.yunyi.ai/register/?aff_code=W0iw |
| OpenCode Go | `https://opencode.ai/zen/go/v1` (`chat_completions`) | https://opencode.ai/ |
| 火山方舟 | `https://ark.cn-beijing.volces.com/api/plan/v3` (`chat_completions`, **full path**) | https://console.volcengine.com/ark |
| AI98PRO | `https://ai98pro.xyz/v1` (`responses`) | https://ai98pro.xyz |
| 智谱 · 国内 API | `https://open.bigmodel.cn/api/paas/v4` (`chat_completions`, **full path**) | https://open.bigmodel.cn/usercenter/proj-api-key |
| 智谱 · 国内 Coding Plan | `https://open.bigmodel.cn/api/coding/paas/v4` | https://bigmodel.cn/coding-plan/personal/overview |
| 智谱 · 海外 API | `https://api.z.ai/api/paas/v4` | https://z.ai/manage-apikey/apikey-list |
| 智谱 · 海外 Coding Plan | `https://api.z.ai/api/coding/paas/v4` | https://z.ai/manage-apikey/apikey-list |

### Protocol pitfall (OpenCode Go / DeepSeek)

Grok Build’s stream parsers are strict. OpenCode Zen Go historically breaks both backends:

| Backend | Failure mode |
|---------|----------------|
| `responses` | Non-OpenAI frames (`{"type":"ping"}`) or `response.*.delta` **without** `sequence_number` → CLI worker fatal |
| `chat_completions` | Trailer frames like `{"choices":[],"x-opencode-type":"inference-cost",…}` **without** required `id` → `Failed to deserialize ChatCompletionChunk` → same crash |

**App fix (automatic):**

1. Prefer preset `api_backend = "chat_completions"` for OpenCode Go (do **not** use `responses`).
2. Host starts a **loopback SSE sanitize proxy** (`relay_stream_proxy`): rewrites that provider’s `base_url` to `http://127.0.0.1:{port}/r/{id}/v1`, stores the real host in `app_upstream_base_url` (CLI ignores unknown keys), and **drops** cost / ping / missing-`id` frames before Grok Build sees them.
3. Settings UI still shows the real upstream URL; repair runs on app start and `providers_list`.

Form shows a **Get API Key** text control under the key field when the channel matches a preset (by id or base host). Opens the URL via `open_external_url`.

CPA / sub2api / grok-go remain generic OpenAI-compatible relays.

### Failed Responses compatibility

Generic custom providers using `api_backend = "responses"` also use the App's
loopback proxy. Grok Build 1.0.34 rejects a `response.failed` event whose failed
response omits `output`, masking the provider error as `missing field output`.
The proxy adds only the missing empty array; it preserves the failed status,
error code/message, event identity, and any existing output. Successful events
are not repaired or converted into failures.

Normal data frames stream through as complete SSE events, including fragmented
UTF-8 and CRLF framing. OpenCode-only drop rules stay limited to those hosts.
HTTP errors retain their status, body and `Retry-After`; generic Responses does
not acquire the vendor proxy's 300-second idle cutoff. Cancellation and retries
remain owned by the runtime, with no Host replay of the whole prompt or tools.

Startup/provider-list repair updates only the App-owned agent profile and keeps
the real URL visible in Settings. Official subscriptions and the native
`grok_build_proxy` contract bypass this generic compatibility path. This fixes
failure decoding, not actual account concurrency limits or upstream outages.

### Grok Build-compatible relay mode

Use `providerMode = grok_build_proxy` only for a relay that intentionally
implements Grok Build's model catalog and native proxy contract. This mode is
separate from ordinary `[model.<id>]` relays:

| Concern | Host contract |
|---------|---------------|
| Opt-in | Settings → Account → Custom providers → Provider mode → **Grok Build-compatible relay**, stored as `app_provider_mode = "grok_build_proxy"`; no BeefAPI or hostname special case |
| Protocol | `responses` only |
| Capability gate | Save reads the live `/models` response and requires every selected model to exist with `supports_backend_search = true` |
| ACP model | Spawn uses the real selected model id, such as `grok-4.6`, rather than the provider section alias |
| Child environment | Only the target `grok agent stdio` process receives `GROK_MODELS_BASE_URL`, `GROK_MODELS_LIST_URL`, `GROK_CLI_CHAT_PROXY_BASE_URL`, and `XAI_API_KEY` |
| Generic compatibility | Generic providers keep `[model.<id>]`, provider-alias spawn, and the existing stream sanitizer behavior |
| Composer id vs CLI id (#1000) | The picker may store `app_models[].id` (request-body id). Host `agent_spawn_model_id` maps that back to the `[model.<id>]` **section** name for both `--model` and `session/set_model`, including when `[models].default` is still official. Cold connect also applies `session/set_model` after `session/new` (same as unpark) so turn 1 and turn 2 cannot diverge. Official catalog ids such as `grok-4.6` are never remapped through a relay that also lists them. |
| Apply | Editing the active provider recycles warm ACP processes; the next send starts with the new catalog and capability contract |
| Attachments | Unchanged: App still sends `@absolute/path` inside ACP text content; this mode does not claim or add native ACP image blocks |

The key stays write-only from the UI and is never included in spawn logs.
`WSLENV` forwards the native URL/key variables without path translation; macOS,
Linux, and native Windows inherit them directly on the child command. This mode
does not enable `official-aux`, does not mix official OAuth into the relay home,
and does not require a second xAI credential.

## Settings UI (Account → Custom providers)

Left / right split (`ProvidersPanel`):

| Side | Content |
|------|---------|
| Left | **Add provider** on top; list of cards. Official Grok card first **only if** signed in / CLI auth / official key; otherwise list starts empty. |
| Right | Create/edit form when adding or selecting a custom card; official detail when selecting the official card; empty placeholder otherwise. |

Each card has **Use** to activate that route (`providers_activate`). Clicking a card opens detail/edit. No long intro copy, agent-home path, or separate “active route” switcher.

### Custom route requires independent data mode (#557)

Custom providers are written only under App **agent-home** `config.toml`. Default `session_data_mode=shared` uses `GROK_HOME=~/.grok`, where those sections are invisible — so third-party channels would fail without official login.

| Event | Host action |
|-------|-------------|
| `providers_activate(custom)` / set custom as default | Force `session_data_mode=independent` when still `shared`; set `switchedToIndependent` on the result |
| `prepare_route_auth_for_agent` on custom | Heal the same way before spawn |
| UI | Toast `prov.switchedToIndependent`; refresh Settings session-data control |

Official route does **not** force mode back to shared.

## Official tool injection

Settings → Account → **Extras** → toggle **Inject official tools** (`official_aux_inject`).

**Only while the active main route is a custom provider.** Official Grok subscription sessions never inject `official-aux` (native tools only).

When the toggle is on, credentials exist, and the route is custom: MCP **official-aux** (`web_search`, all `x_*`, `vision_describe`) under `agent-home-official`. Default does **not** also load extension MCPs (`official_aux_with_user_mcp` off) so tools are not stuck behind 30s Playwright timeouts. Does **not** put `auth.json` back into the custom main agent-home. See [model-routing.md](./model-routing.md).

## Route switching (auth isolation)

Grok Build 0.2.x will send **OIDC** when `auth.json` is present — even if the request URL is a custom relay. That produces:

`Unauthorized (401) from https://api.example.com/v1/responses` with `Auth: Oidc`.

Verified working combinations:

| Route | `[models].default` | agent `--model` | agent-home `auth.json` |
|-------|--------------------|-----------------|------------------------|
| Custom relay | provider id (`yunyi`) | **provider id** | **removed** (api_key only) |
| Official | `grok` | catalog id (`grok-4.6`) | **synced** from `~/.grok` |

Host must rebind both sides on every switch and before each ACP spawn (`prepare_route_auth_for_agent` + `agent_spawn_model_id`). After official login / account switch, call `prepare_route_auth_for_agent` instead of blindly copying `auth.json` into agent-home — a custom main must stay api_key-only. Custom ACP processes also **skip** `authenticate(cached_token)` because that RPC reads `~/.grok/auth.json` even when `GROK_HOME` is agent-home. Composer catalog `modelId` remains the official selection preference; spawn resolves the channel id separately. **Alternate activate entry:** picking a custom provider row in the composer model menu also calls `providers_activate` (same Host path as Settings **Use**).

## Host commands

| Command | Role |
|---------|------|
| `providers_list` | Providers + default (no raw keys); blocking pool |
| `providers_upsert` | Create/update; empty key keeps previous; recycles warm agents when default/active route changes (`provider_route`) so next send applies without app restart |
| `providers_remove` | Delete section; recycles warm agents |
| `providers_set_default` | Set default model id; recycles warm agents |
| `providers_activate` | Switch official/custom route + rebind auth; recycles warm agents |
| `providers_ping` | `GET {base}/models` RTT |
| `providers_list_models` | Fetch remote model ids |
| `providers_test_model` | Per-model probe: one tiny non-streaming inference request to `{base}/chat/completions` (\| `/responses` \| `/v1/messages` by `api_backend`); success = HTTP 2xx |
| `providers_balance` | Account balance / plan probe (Phase 1: **DeepSeek only**) |
| `providers_cc_switch_scan` | Read-only scan of local **CC Switch** Grok Build providers |
| `providers_cc_switch_import` | Import selected CC Switch rows into custom providers |
| `editors_list` | Detected local IDEs |
| `open_in_editor` | Open path in chosen editor |

### Balance probe (Phase 1: DeepSeek)

| Item | Detail |
|------|--------|
| When | Channel id/host is DeepSeek (`deepseek` / `api.deepseek.com`) — **not** DeepSeek models on OpenCode Go / 火山方舟 |
| Endpoint | `GET https://api.deepseek.com/user/balance` (origin root; strip `/v1` from stored base) |
| Auth | Bearer `api_key` from agent-home (or form draft) |
| UI | Settings → Custom providers **Check balance** (full lines); expanded-sidebar pin chip `110.00 CNY` when active |
| Cache | Session memory, 5 min TTL; refresh on UserMenu open / explicit button; no disk, no polling |
| Honesty | Never invent `0.00` on failure; amounts stay **strings** |

Wire shape (confirmed):

```json
{
  "is_available": true,
  "balance_infos": [
    {
      "currency": "CNY",
      "total_balance": "110.00",
      "granted_balance": "10.00",
      "topped_up_balance": "100.00"
    }
  ]
}
```

Future providers (Coding Plan quotas, etc.) add adapters under the same `providers_balance` command.

**Live apply (#376):** Do **not** only park the live agent (`session_disconnect`) after provider edits — parked processes keep old OIDC/`config.toml` in memory. Host `recycle_all_agents(..., "provider_route")` after route-affecting writes. Settings UI always clears “Saving…” in `finally` and soft-fails apply errors with a toast (config is already on disk).

## Import from CC Switch (#167)

Settings → Account → Custom providers → **Import from CC Switch**.

| Step | Behavior |
|------|----------|
| Detect | Resolve `cc-switch.db` (see paths below); open SQLite **read-only** |
| Scope | `providers` where `app_type = 'grokbuild'` |
| Preview | Multi-select list (no full API keys; status badges) |
| Import | Map TOML → current agent-home `config.toml`; **same id overwrites** (no UI toggle); does not auto-activate route |
| Native capability | An explicit `app_provider_mode` is honored. Otherwise a Responses provider is promoted to `grok_build_proxy` only when its selected real model advertises `supports_backend_search = true` in the live `/models` response |
| Apply | Any successful import recycles warm ACP children so the next send cannot reuse stale provider semantics |

### CC Switch data paths (cross-platform)

| Priority | Location |
|----------|----------|
| 1 | `GROK_APP_CC_SWITCH_DIR` or `CC_SWITCH_HOME` env (if set and contains db) |
| 2 | Tauri Store override: `app_config_dir_override` in `app_paths.json` under `com.ccswitch.desktop` |
| 3 | **Default:** `{user_home}/.cc-switch/cc-switch.db` (macOS / Windows / Linux) |
| 4 | Windows only: `{HOME}/.cc-switch/cc-switch.db` when Profile default is missing (v3.10.3 legacy) |

Store file locations:

| OS | `app_paths.json` |
|----|------------------|
| macOS | `~/Library/Application Support/com.ccswitch.desktop/app_paths.json` |
| Windows | `%APPDATA%\com.ccswitch.desktop\app_paths.json` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/com.ccswitch.desktop/app_paths.json` |

Official CC Switch rows are not imported as custom relays. Proxy-takeover placeholders (`PROXY_MANAGED`, `127.0.0.1:…`) are rejected.
Capability detection never matches provider names or hosts. Explicit native mode
fails closed when the live catalog cannot validate it; implicit probe failures
preserve the previous generic import behavior.

## Security

- UI only sees `hasApiKey`.
- Logs must redact keys (existing redact paths).
- Official OAuth (`auth.json`) stays separate from relay keys.

## Sponsorship (L3, future)

Recommended catalog / paid naming sits **above** L2 as templates only. Keys always user-owned. See `docs/分析-Grok-Desktop对照报告.md` §7.

### Unavailable model errors

Model-not-found / unsupported-model RPC failures remain provider errors on the
Host. The error deck refines their details to `MODEL_UNAVAILABLE`, including
legacy `AGENT_CRASHED` wrappers, and opens Providers so the user can correct the
model ID. Bare process-exit errors still use the crash/reconnect path.

### Stream decoding failures

Known provider-stream decoding failures (`ResponseStreamEvent`,
`ChatCompletionChunk`, `stream_read_error`, and the observed JSON control-character
serialization error) map to `NETWORK_PROVIDER`. An RPC error alone does not prove
that the CLI process exited. The UI also refines legacy `AGENT_CRASHED` labels when
the original error details match, for both the banner and the turn error bubble.
Raw diagnostics stay available; a bare process exit still uses the crash path.
This classification does not repair malformed upstream responses, rewrite stream
packets, or automatically replay a failed prompt.

### Official alias collision

`grok` is reserved for the CLI official route; new/edited custom providers must use
another ID. Switching to official preserves any legacy custom `[model.grok]` under
`grok-custom` (or a free numbered suffix), including its key, models and sanitizer
URL. The renamed relay remains selectable; the official default no longer resolves
back to that relay. Existing legacy relays continue to work until switched.

## Session and channel append rules (2026-10-04)

Native ACP sessions now send merged session rules, provider append prompts, path
citation and browser policy through `session/new._meta.rules`. Grok Build 1.0.41
folds this into its default system prompt; the Host does not replace that prompt
or write per-session instructions into shared `rules/` files. Warm processes use
the same session/new path. Resumed/forked conversations retain their original
instruction snapshot: create a new chat after changing append rules. Remote legacy
launches retain the existing CLI flags as well. Global `~/.grok/AGENTS.md` loading
continues through the existing native file loader.

Verification: the bundled 1.0.41 executable, an isolated HOME/GROK_HOME, and a local
mock inference server confirmed two ACP sessions each include only their own rules
in actual inference requests. No production account, files, or model endpoint used.
