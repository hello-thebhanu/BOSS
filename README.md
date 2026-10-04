# BOSS — Bhanu Open Source System

Local-first, private-by-default AI coding companion foundation.

## Status

Phase 12.4 adds named native SQLite CRUD commands and a safe project-registration picker. Project roots are canonicalized and validated in Rust; registration removal never deletes files. Phases 12.5–12.9 add typed filesystem, terminal, Git, local-model, and agent-lifecycle boundaries. Their native implementations remain unavailable because this environment has no Rust/Cargo toolchain or local model runtime; BOSS does not emulate them.

## Start

```powershell
npm install
npm run dev
npm test
npm run build
```

For the desktop shell, install the Rust toolchain and Tauri system prerequisites, then use the Tauri CLI in a later integration step. The current Rust shell exposes only a harmless version command.

## Layout

```
src/app              app composition, routing, global store
src/components       reusable shell, navigation, common UI, and BOSS Core
src/core             domain types, state machine, security, errors
src/pages            first-launch, workspace, and settings route modules
src/services         provider, agent, tool, auth, and native contracts
src/storage          persistence contracts and SQLite schema boundary
src/services/storage typed repositories, gateway, migrations, and local-data service
src-tauri            minimal secure desktop command boundary
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the layer model, security rules, roadmap, and implementation constraints.
