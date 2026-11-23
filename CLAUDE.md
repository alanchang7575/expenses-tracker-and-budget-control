# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page expense tracker with per-category daily budgets. Plain HTML/CSS/JS — **no framework, no build step, no package.json, no tests, no linter**. Currency is fixed to SGD (displayed `S$`).

- `index.html` — markup only (tabs, dialog, containers with ids that `app.js` fills)
- `style.css` — all styling; theme via CSS variables
- `app.js` — all logic, one IIFE
- `mockup.html` — iPhone/Android frames that embed `index.html` in iframes (no logic; just a preview page)

## Running and checking

- Open `index.html` directly in a browser, or serve the folder over HTTP. Python is not installed on the dev machine; use Node for a throwaway static server if one is needed.
- Syntax check: `node --check app.js`
- There is no test suite. Verify behaviour in a browser (check phone width ~390px as well as desktop).
- Don't leave helper files (e.g. a `.claude/serve.js` / `launch.json` used for previewing) in the project folder.

## Architecture

`app.js` follows a simple state → render loop:

- **`state`** (persisted to `localStorage` key `expenseTracker.v1` by `save()`): `{ categories: [{id,name,color}], expenses: [{id,desc,amount,category,date,created}], budgets: { byCategory: {catId: wholeDollars} } }`. Dates are `YYYY-MM-DD` strings; the selected day is compared by string equality.
- **`ui`** (not persisted): selected `date`, active `tab`, search/filter, and which expense/category is being edited.
- **`render()`** re-renders everything (summary, chart, expense list, budgets, categories, backup stats) from `state` + `ui` using `innerHTML` strings. Any user-supplied text must go through `esc()`. Every mutation follows the same pattern: change `state` → `save()` → `render()`.
- **Event handling** is delegated: one document-level click listener dispatches on `data-action` / `data-id` attributes (so buttons rendered by `innerHTML` need no per-element listeners). Form `submit`/`change` listeners are attached once at the bottom of the file.
- The expense add/edit form is one `<dialog>`; `ui.editingExpense` decides whether submit creates or updates.

### Behaviours that span several places

- **Budgets are daily, per category only** (no overall/monthly budget). Everything is scoped to the selected day via `dayExpenses()` / `spentByCategory()`. `level()` maps spent/budget to `''` / `warn` (≥80%) / `over` (>100%) and drives colours in the progress bars, the chart, and the post-save warning (`budgetWarning`).
- **Money:** expense amounts keep cents (rounded to 2dp); budget limits are whole dollars (input `step=1`, rounded on change). Format only through `money()`.
- **Chart** (`renderChart`) is hand-built inline SVG with two layouts: a wide one (fixed 640px viewBox) and `renderChartCompact` used when the container is < 520px, drawn at real pixel width so text stays readable on phones. A `resize` listener re-renders it when the window width changes.
- **Deleting a category** reassigns its expenses (and budget) to "Other" or another category.
- **Backup/restore:** `exportBackup` writes `{app:'expense-tracker', version:1, data:{...}}`; `importBackup` → `sanitizeBackup` validates and rebuilds every field, then replaces all state after a confirm. **When adding a field to expenses/categories/budgets, update `sanitizeBackup` too**, or the field will be silently dropped on import.
- **Theme:** `data-theme="light|dark"` on `<html>`, saved under `expenseTracker.theme`. With no saved choice, `style.css` follows `prefers-color-scheme` via `:root:not([data-theme])`. Dark palette values exist in two places in `style.css` (explicit and media-query) — change both.
- Old saved data may still contain removed fields (`currency`, `budgets.overall`); they are ignored, not migrated.

## Conventions

- Keep it dependency-free; no external scripts or fonts.
- Mobile matters: inputs are 16px on small screens (prevents iOS zoom), and the layout must not scroll horizontally at 390px.
