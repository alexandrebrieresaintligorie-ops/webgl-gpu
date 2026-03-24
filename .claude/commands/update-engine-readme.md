---
name: update-engine-readme
description: Sync the Engine API tables in src/webgpu/engine/README.md with Engine.ts and types.ts
invocation: /update-engine-readme
---

The user wants to resync `src/webgpu/engine/README.md` with the current public interface of the Engine class.

## Step 1 — Read the source of truth

Read both files in full:
- `src/webgpu/engine/Engine.ts`
- `src/webgpu/engine/types.ts`

## Step 2 — Read the current README

Read `src/webgpu/engine/README.md` in full.

## Step 3 — Reconcile the Methods table

Extract every public method and getter from `Engine.ts`. Compare against the `| Method / Property |` table under `## Engine API > Methods`.

- **Update** rows whose name, return type, or description has changed.
- **Add** rows for methods present in Engine.ts but missing from the table.
- **Remove** rows for methods that no longer exist in Engine.ts.
- Keep existing descriptions for unchanged methods; write concise new ones for added methods.

## Step 4 — Reconcile EngineOptions

Extract the `EngineOptions` type from `types.ts`. Update the options table under `### Engine.create(canvas, opts?)` to match — same add/update/remove logic.

## Step 5 — Reconcile Table of Contents

If renderable `create*` or `load*` methods were added or removed:
- Update the TOC bullet list to match the `##` sections that exist.
- Do **not** create new `##` sections automatically — that requires manual prose. Only add/remove TOC entries to reflect what already exists in the file.

## Step 6 — Write the updated README

Apply all edits to `src/webgpu/engine/README.md`.

**Never touch:**
- Quick Start code examples
- Vertex Format section
- Render Pipeline section
- Math Utilities section
- Resource Lifecycle section
- Any `##` renderable section prose, option tables, or handle-method tables — those are maintained manually

## Step 7 — Confirm

Tell the user:
- Which table rows were **added**, **updated**, or **removed**
- Which `create*`/`load*` methods in Engine.ts have **no corresponding `##` section** in the README yet (needs manual documentation)
- If nothing changed: say so explicitly
