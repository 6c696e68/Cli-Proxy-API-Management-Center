# Panel handoff

Notes for the custom management panel that ships with the keyrelay fork. The backend side is
documented in `../CLIProxyAPI/docs/handoff.md`; read the two together, because every panel change
is bound to a backend contract.

## 1. What this repository is

A React 19 + TypeScript + Vite single-page app that manages one CLIProxyAPI process. It is not the
proxy. It uses the v8 Management API under `/v8/management` and the v8 config layout only.

Two sanctioned exceptions exist:

- Plugin resources (`/v0/resource/plugins/<id>/...`) and plugin-declared HTTP routes keep their
  backend paths. Do not rewrite them into `/v8`.
- `src/services/api/legacyBackendProbe.ts` may call one v0 endpoint, only to detect an outdated
  backend after a v8 login 404 and show a clearer error. It must never supply data or act as a
  login fallback.

The production artifact is a single `dist/index.html` with JS, CSS, and assets inlined by
`vite-plugin-singlefile`. It is deployed as `management.html` on the router.

## 2. Toolchain and commands

Bun is the package manager; `package.json` pins `bun@1.3.14`, CI uses Node.js 24. Keep
`bun.lock` consistent and do not add another lockfile.

| Command | Effect |
| --- | --- |
| `bun install --frozen-lockfile` | Install locked dependencies |
| `bun run dev` | Vite dev server, `http://localhost:5173` |
| `bun run build` | `tsc` then `vite build` into `dist/` |
| `bun run preview` | Serve the built output |
| `bun run test` | All Bun tests under `tests/` |
| `bun test tests/apiError.test.ts` | One focused test file |
| `bun run lint` | ESLint over TS/TSX |
| `bun run type-check` | `tsc --noEmit` over `src` |
| `bun run verify` | test + lint + build |

Run `bun run verify` before a `management.html` deploy.

Known failures at the current tip: seven tests fail in `tests/visualConfigRebase.test.ts` and
`tests/configDocumentSemantics.test.ts`, identically on a clean checkout of the pushed commit. They
cover raw YAML payload-rule drafts and are unrelated to the plugin config work. `lint` and `build`
pass. Treat them as a standing task, not as a regression from a plugin change.

## 3. Directory map

| Path | Contents |
| --- | --- |
| `src/features/` | Feature-owned pages, components, hooks, and logic: `dashboard`, `providers`, `authFiles`, `oauth`, `quota`, `config`, `logs`, `plugins`, `modelMapping` |
| `src/pages/` | Route pages outside the feature layout: login, system, OAuth excluded-model and model-alias editors |
| `src/components/` | Shared UI, including `ui/`, `layout/`, `providers/`, `modelAlias/` |
| `src/services/api/` | API client, domain endpoints, backend normalization |
| `src/stores/` | Zustand state |
| `src/types/` | Shared types |
| `src/router/MainRoutes.tsx` | Authenticated route table |
| `src/i18n/locales/` | Six locale files, registered in `src/i18n/index.ts` |
| `tests/` | All tests, fixtures in `tests/fixtures/`, helpers in `tests/helpers/` |

Conventions: two-space indentation, semicolons, single quotes, ES5 trailing commas, 100-character
width, `@/` alias for `src`. Component files are PascalCase, hooks are `useName`, API modules are
domain names. SCSS Modules sit beside their component; `src/styles/variables.scss` is injected
automatically.

## 4. Routes

| Path | Page |
| --- | --- |
| `/`, `/dashboard` | `DashboardPage` |
| `/ai-providers`, `/quick-start` | `ProvidersWorkbenchPage` |
| `/auth-files` | `AuthFilesPage` |
| `/auth-files/oauth-excluded` | Excluded-model editor |
| `/auth-files/oauth-model-alias` | Model-alias editor |
| `/oauth` | `OAuthPage` |
| `/model-mapping` | `ModelMappingPage` |
| `/quota` | `QuotaPage` |
| `/plugins` | `PluginsPage` |
| `/plugins/:pluginId`, `/plugins/:pluginId/:menuIndex` | `PluginResourcePage` (iframe) |
| `/plugin-pages/:pluginId/:menuIndex` | Alias of the plugin resource route |
| `/plugin-store` | `PluginStorePage` |
| `/config` | `ConfigPage` |
| `/logs` | `LogsPage` |
| `/system` | `SystemPage` |
| `*` | Redirect to `/` |

Plugin routes are gated on `supportsPlugin`, which comes from the backend capability header. When
the backend does not support plugins, those paths redirect to `/` instead of rendering a broken
iframe.

## 5. API layer

- `MANAGEMENT_API_PREFIX = '/v8/management'` in `src/utils/constants.ts`. Domain modules build
  paths relative to that prefix; never prefix it twice.
- `src/services/api/client.ts` centralizes the base URL, `Authorization: Bearer <management key>`,
  timeouts, error normalization, and response-header handling. Add endpoints in a domain module and
  use `apiClient`; do not hand-roll requests inside components.
- Client events: `unauthorized` for 401 handling, `server-version-update` for version and build
  metadata, `server-plugin-support-update` for plugin capability.
- Normalize on read and serialize on write in the API layer (`transformers.ts` plus the domain
  module). Keep raw backend field names out of ordinary components.
- `useConfigStore.fetchConfig(forceRefresh?)` is a full-config TTL cache with in-flight
  deduplication. Reuse it, and invalidate or update caches after mutations with the existing store
  actions.
- Preserve stale-request guards and cache cleanup when switching connection or logging out. An old
  response must not overwrite the new session's state.

## 6. Custom flows that must survive an upstream sync

Take the new upstream layout and restyle onto it. Do not restore the old page shell.

### 6.1 Model Mapping

`src/features/modelMapping/ModelMappingPage.tsx` plus `GroupedModelSelect.tsx`.

- Reads and writes `/v8/management/routing/model-mapping`.
- `src/services/api/modelMapping.ts` normalizes rules: `match`, `target`, `mode`
  (`exact` / `wildcard` / `regex`), `force-mapping`, `enabled`. An empty mode is inferred from the
  match (`*` means wildcard, otherwise exact).
- The target select groups models by provider and is searchable.
- The backend is the source of truth for YAML. A successful save hot-reloads the backend config.

### 6.2 Plugin config

Plugin configuration is edited in `PluginConfigSheet.tsx` and must not move back into
`PluginsPage.tsx`.

- `pluginConfigDraft.ts` builds the draft. Field values come from `currentConfig`, and a missing key
  now seeds `field.defaultValue` from the backend schema instead of an empty value.
- `services/api/plugins.ts` normalizes the plugin config schema, including the server-provided
  `default` (also accepted as `Default`, `default_value`, `defaultValue`) and enum values.
- `PluginModelsEditor.tsx` and `pluginModels.ts` own model rows (`parsePluginModels`,
  `modelsForEditorValue`, `serializePluginModels`, `applyPluginModelsValue`). The editor keeps text
  drafts while the parsed rows stay the source of truth.
- `vipProConfigValidation.ts` validates `ch-relay-vippro` before save. It accepts uppercase enum
  values such as `ONLY` and `Sticky`, accepts an empty `model-cooldown-minutes`, rejects a cooldown
  above `10080`, rejects control characters such as NUL in `stats-file`, and validates
  `free-models` as a JSON array of non-empty names that must match a model `name` or one of its
  `fallback` entries. Errors are keyed by field and applied by `applyChRelayVipProErrors`.

### 6.3 Plugin menus

`PluginsPage` lists plugins and opens `/plugins/:pluginId`, which renders `PluginResourcePage` in an
iframe. Do not mount `VipProPage` in `MainRoutes`; that page is legacy. VipPro stats stay on
`GET /v0/management/ch-relay-vippro/stats` and
`POST /v0/management/ch-relay-vippro/accounts/check`.

key-shop opens its admin UI as a plugin resource. The backend also serves `/client` for customers;
the panel does not render that page.

### 6.4 Auth Files and Quota ordering

Both pages sort by plan: Plus/Pro before Free, then a filename-suffix fallback, then unknown last.
Keep this sort on the current upstream cards when syncing; do not copy the old page.

## 7. i18n

Six locales, all required for a new key: `en`, `vi`, `zh-CN`, `zh-TW`, `ru`, `ko`. Fallback is
`zh-CN`. Include accessible labels, not only visible text. Keep user-facing text out of components.

## 8. Tests

Tests are centralized in `tests/` as `*.test.ts` and use `bun:test`; there are currently 171 test
files. Existing suites cover pure logic, React static rendering through `renderToStaticMarkup`, and
source/contract checks. There is no browser DOM harness, so static markup tests do not prove browser
interaction.

For a code change: add or update a regression test, run it focused while working, then run
`bun run verify`. For a UI change, also open the route in a browser and record what you checked.
For a documentation-only change, a diff review is enough.

## 9. Build and deploy

```bash
bun run verify
bun run build
# artifact: dist/index.html
```

Deploy only `dist/index.html` renamed to `management.html`:

```bash
scp dist/index.html root@192.168.8.1:/root/.cliproxyapi/static/management.html
```

Do not edit `dist/` by hand. Do not overwrite the router `config.yaml` or `auth/`.
`disable-auto-update-panel` is already `true`, so the backend will not replace the file.

`__APP_VERSION__` is injected from `VERSION`, then git tags, then the package version, then `dev`.

## 10. Upstream sync

The sync source is `router-for-me/Cli-Proxy-API-Management-Center` `main`, and it must stay in step
with `../CLIProxyAPI` on `feat/model-mapping`.

1. Back up: a `feat/model-mapping-pre-sync-<date>` branch plus a bundle in
   `/Volumes/SSD/Developments/fork/backups/`.
2. Rebase or merge `upstream/main` only. Never merge old `origin/feat/model-mapping` history.
3. Keep every flow in section 6. Rewrite a stale implementation against the new upstream code
   instead of deleting the flow.
4. Add new i18n keys to all six locales.
5. Run `bun run verify`, then check the affected routes in a browser.
6. Push only when asked, to `origin` with the `lantrinh1999` account. The `6c696e68` handoff repo
   uses the `6c696e68` account; see the backend handoff for the push commands.

## 11. Security

Never commit management keys, provider credentials, auth files, or secrets. Redact them from logs,
screenshots, and fixtures. Management keys are entered at runtime; `src/services/storage/secureStorage.ts`
provides reversible obfuscation, not encryption, and is not a security boundary. Do not weaken
authentication, plugin trust checks, or session isolation for convenience.

## 12. Troubleshooting

| Symptom | Cause | Check |
| --- | --- | --- |
| Login 404 with a v8 build | Outdated backend | `legacyBackendProbe`, backend version |
| Plugin menu blank | Backend without plugin support, or plugin not loaded | `supportsPlugin`, backend log |
| Plugin iframe stuck | Backend route missing | `GET /v0/resource/plugins/<id>/...` directly |
| Model Mapping save does nothing | Backend predates `routing.model-mapping` | Backend build, `PUT` response |
| Config field resets to empty | Field has no server `default` | `default` in the plugin config schema |
| `ch-relay-vippro` save rejected | Validation rules in `vipProConfigValidation.ts` | Field-level error map |
| Stale data after switching server | Cache not cleared | Store actions, `connectionRevision` |

## Tóm tắt tiếng Việt

- Panel là app React 19 + TypeScript + Vite, build ra đúng một file `dist/index.html`, deploy thành
  `management.html` trên router.
- Chỉ dùng API `/v8/management` (trừ plugin resource và route do plugin khai báo).
- Giữ các luồng: tab Model Mapping (`/v8/management/routing/model-mapping`), sửa config plugin
  trong `PluginConfigSheet`, menu plugin mở qua `PluginResourcePage`, sort Plus/Pro trước Free ở
  Auth Files và Quota, i18n đủ 6 ngôn ngữ.
- Trước khi deploy phải chạy `bun run verify`. Hiện có 7 test nền tảng đang fail sẵn (raw YAML
  payload), không liên quan thay đổi plugin.
- Đồng bộ upstream: backup trước, chỉ sync từ `upstream/main`, giữ các luồng ở mục 6, push khi được
  yêu cầu.
