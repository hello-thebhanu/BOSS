# BOSS architecture

BOSS is a local-first desktop coding companion. This repository establishes boundaries and contracts only; it does not claim to provide an AI model, terminal, cloud login, or filesystem implementation.

## Technology decisions

- **React + TypeScript + Vite:** typed, fast UI foundation that preserves the existing Stitch visual direction.
- **Tauri 2 + Rust:** minimal desktop shell and the only future route to native filesystem, terminal, Git, and OS APIs.
- **Zustand:** small global state store; domain state remains in feature/application services rather than UI components.
- **SQLite:** local structured persistence initialized only by the Tauri process. Secrets belong in OS keychain/credential storage, never SQLite plaintext.
- **Provider interfaces:** no Firebase or model backend is coupled to the UI.

## Layers and ownership

```
React UI → application store/services → agent orchestration → permission service → tool runtime → native bridge → OS
```

React can render state and request application operations. It cannot invoke shell commands, enumerate arbitrary paths, use model-provider SDKs, or call Tauri directly. Native commands must validate project-root-relative paths and require an approval identifier for dangerous work.

## Routing

`src/app/router/routes.ts` declares `/welcome`, `/trailer`, `/auth`, `/home`, `/chat`, `/projects`, `/coding`, `/terminal`, `/tools`, `/history`, and the required `/settings/*` routes. The current router is intentionally dependency-light and real (History API); individual Stitch screens can become lazy page modules without changing paths.

## Application shell and Stitch integration

Phase 12.2 adds one desktop shell for every workspace route: `AppShell` composes `Sidebar`, a minimal window frame, route content, and a global status bar. First-launch routes deliberately remain outside that shell. The History API router intercepts internal route links, so navigation stays in-app without a page reload.

The Stitch blueprint is being integrated as reusable route modules, not copied as separate static pages. `workspace/WorkspacePages.tsx` provides the current home, chat, project, studio, terminal, tools, and history shell modules. `SettingsPage` supplies one settings layout and navigation for all nested settings routes. As the final Stitch source exports become available, their screen-specific content should replace only the interior of these modules, retaining routes, contracts, and shell.

### Export mapping (Phase 12 Stitch integration)

The inspected export is at `Stitch-Export/stitch_boss_ai_desktop_landing`. Its generated `code.html` files are visual reference only; none are mounted or copied into BOSS. The mapping is: first-launch welcome → `/welcome`; cinematic storyboard → `/trailer`; playful authentication → `/auth`; authenticated home → `/home`; conversation workspace → `/chat`; projects workspace → `/projects`; AI-native coding workspace → `/coding`; dedicated terminal → `/terminal`; tools/plugins workspace → `/tools`; history workspace → `/history`; system control center and its Appearance, Voice, Models, Memory, Profile, Permissions, and About variants → `/settings/*`. Holographic orbital exports map to the single `BossCore` state machine component.

The export has no reusable source assets beyond reference screenshots and generated HTML, so no screenshots or duplicate images are shipped in the application. Its design specification has been translated to tokens and shared styles in `tokens.css`, `stitch.css`, `firstLaunch.css`, and `workspace.css`.

## Design system

`src/styles/tokens.css` is the visual single source of truth for obsidian surfaces, translucent panels, cyan/violet/green accents, borders, typography, spacing, radii, shadows, glow, and motion timing. Shared styles support focus visibility, keyboard-native controls, desktop scaling, restrained route/panel transitions, and state-driven Core presence. UI status labels explicitly say **not connected** where a backing service is absent.

The `BossCore` orbital composition responds exclusively to its existing state status: READY is calm, LISTENING modulates internal bars, THINKING and WORKING accelerate orbital movement, SPEAKING shifts to violet resonance, and COMPLETE uses the verified success colour. It has no timers or page-local state.

## BOSS Core

`coreStateMachine.ts` is the single source of truth for Core status and animation mapping:

```
READY → THINKING → WORKING → COMPLETE → SPEAKING → READY
  └── LISTENING → THINKING
```

Invalid transitions throw. `BossCore` consumes this state once, avoiding per-screen duplicated animation behavior.

## Service and domain contracts

- `ModelProvider`: load, unload, generate, stream, cancel, and status for local or optional cloud backends.
- `BossAgent`: interpretation, planning, observation, response stream, cancellation.
- `Tool<I,O>`: name, schema, permissions, and typed result. Tool implementations are separately testable.
- `PermissionService`: `ALLOW_ONCE`, `ALLOW_SESSION`, or `DENY` for sensitive operations.
- `AuthService`: local continuation is first-class; future email/Google/GitHub adapters plug in later.
- Conversation types support streaming statuses, attachments, tool calls, and metadata without fake streaming.

## Storage

SQLite lives behind `src/services/storage`: page modules call `localData`, repositories call `StorageGateway`, and only `TauriStorageGateway` may invoke the narrow native persistence boundary. React components never receive a database handle or SQL string.

On desktop startup, `src-tauri/src/storage.rs` creates `boss.sqlite3` in Tauri's application-data directory, enables foreign keys/WAL, and applies append-only migrations exactly once using `schema_migrations`. The initial migration is [0001_foundation.sql](src-tauri/migrations/0001_foundation.sql) and creates `projects`, `conversations`, `messages`, `sessions`, `agent_actions`, `tool_executions`, `settings`, `memory_items`, and `permissions_audit`, plus lookup indexes. Initialization errors are returned with non-sensitive diagnostics; no cloud service is involved.

Typed repositories cover projects, conversations, messages, settings, sessions/history, memory, and permission audit. The native CRUD command implementations remain deliberately deferred: the route modules therefore show an unavailable state unless a real native repository binding exists, and never invent records.

## Security boundary

No unrestricted native capability is configured. `NativeBridge` is a contract for future approved, project-scoped operations. Before implementation, each command must validate canonical paths against an approved project root, independently verify permissions, redact secrets from output, and audit the request. Network, destructive file work, commands, and Git operations require explicit permission decisions.

### Phase 12.4 registration boundary

The native command surface consists of named repository CRUD commands only; it exposes neither SQL nor generic filesystem operations. `register_project` opens a native folder picker, checks existence, directory status, accessibility, and canonical form, then persists only that canonical root. `enforce_project_boundary` is the required guard for future component-aware project-relative operations and rejects canonical paths outside the registered root. Deleting a project is solely `DELETE FROM projects`; BOSS has no file deletion command.

Permission decisions are persisted as real audit records: `ALLOWED_ONCE`, `ALLOWED_SESSION`, `ALLOWED_ALWAYS`, and `DENIED`. Session grants exist only in native memory, durable grants are narrowly keyed by capability and target in `permission_grants`, and decisions are validated/recorded inside the native boundary.

## Testing strategy

Unit-test pure state machines, permission policies, tool contracts, and repository adapters with Vitest. Add service integration tests with a temporary SQLite database and mocked bridge; add Rust command tests for canonical-path and permission enforcement; add end-to-end desktop smoke tests only after real Tauri commands exist.

## Phase 12.4

Implement narrowly scoped native CRUD commands for the typed repositories; add a database backup/recovery policy; build permission prompts/auditing; implement project registration and path-safe native commands; wire real chat persistence only when a model provider exists; add a secure credential store; expand Rust integration tests and CI.

## Phases 12.5–12.9 runtime boundaries

Typed `ProjectFilesystem`, `TerminalService`, `GitService`, `LocalModelRuntime`, and agent lifecycle contracts are present. Their privileged methods require a permission decision and do not expose fallback React access to the filesystem, shell, Git, or model runtime. Native implementations are intentionally unavailable until Rust/Tauri can be compiled and a verified PTY/local-model runtime is present.
