---
name: add-engine-util
description: Add a stateless utility or small factory to the engine's utils folder
invocation: /add-engine-util
---

The user wants to add a stateless function or small factory to `src/webgpu/engine/utils/`.

## Rules (enforce these every time)

1. **Stateless functions** — no `this`, no class state. Accept only plain arguments, return a value.
2. **Grouping by goal** — place the new function in an existing utils file if its goal matches. Current files:
   - `assetLoaders.ts` — fetch + parse + upload to GPU (OBJ, FBX, or similar asset types)
   - `bindGroupLayouts.ts` — `GPUBindGroupLayout` factory functions
   - Create a new file only when none of the above match.
3. **Factory size rule** — if a factory function body is < 50 lines, it belongs in the same file as other factories of similar kind. Only create a new file when the function is large enough to warrant isolation, or when it serves a distinctly different goal.

## Steps

### Step 1 — Understand the function
Read the relevant files to understand what the new function does and where it belongs. If the user has not provided the implementation, ask for it or derive it from context.

### Step 2 — Choose the target file
Apply the grouping rules above:
- Does it load/parse an asset? → `assetLoaders.ts`
- Does it create a `GPUBindGroupLayout`? → `bindGroupLayouts.ts`
- Otherwise → create a new file named after its goal (e.g., `samplers.ts`, `pipelines.ts`)

### Step 3 — Add the function
- Add the function to the chosen file.
- Export it.
- Keep it stateless: all dependencies passed as arguments, no module-level mutable state.

### Step 4 — Update `utils/index.ts`
Add the new export to `src/webgpu/engine/utils/index.ts`.

### Step 5 — Update the consumer (usually Engine.ts)
- Import the new function from `'./utils'`.
- Replace any inline implementation in `Engine.ts` (or elsewhere) with a one-liner call.
- The Engine's **public method signatures must not change** — the method stays on the class, its body just delegates.

### Step 6 — Verify
Run `npx tsc --noEmit` and confirm there are no type errors before finishing.
