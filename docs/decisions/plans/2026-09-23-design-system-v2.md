# QA Workspace Design System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the QA Workspace's visual language (typography, color, contrast, surface, status treatment, micro-motion) with the spec in `~/Downloads/QA_WORKSPACE_VISUAL_DESIGN_SYSTEM_V2.md`, without touching layout, DOM structure, navigation, or information architecture.

**Architecture:** The app is a Tailwind v4 CSS-first theme (`src/styles.css`, no `tailwind.config`) with all colors expressed as CSS custom properties consumed via semantic Tailwind classes (`bg-primary`, `text-muted-foreground`, `border`, …). A repo-wide scan confirmed there are **no hardcoded hex/gray colors** in component files outside the vendored `chart.tsx`, and **no dark-mode toggle exists anywhere** (the `.dark` block in `styles.css` is unused shadcn boilerplate). This means the large majority of the visual system can be swapped by rewriting the token layer in one file (`styles.css`) plus a small, bounded set of shared primitives (`badge.tsx`, `badges.tsx`, `button.tsx`, `progress.tsx`, `card.tsx`, `table.tsx`, `layout-parts.tsx`, `coverage.tsx`, the font `<link>` in `__root.tsx`). Page-level components consume these primitives and inherit the change automatically — no page file needs a rewrite.

**Adaptation from the standard plan template:** this is a CSS/design-token change, not a logic change, and the repo has **no test framework** (`vitest`/`jest` configs absent, confirmed by search). Each task's "verify" step is therefore a visual check against `npm run dev` and the spec's own acceptance criteria (spec §19), not a unit test. This matches how the skill instructs adapting process to context.

**Tech Stack:** Vite + TanStack Start + Tailwind CSS v4 (CSS-first `@theme`) + shadcn/ui (Radix) components, oklch/hex CSS custom properties.

**Out of scope (per spec §1 "Do Not" and §18):** layout, sidebar width/position, grid/flex structure, table columns, card order, information architecture, dark mode (unused — left untouched), sidebar chrome color (not specified by the doc, and changing it isn't required to hit any acceptance criterion).

---

### Task 1: Rewrite core design tokens

**Files:**
- Modify: `src/styles.css:1-102` (theme comment, `@theme inline` block, `:root` block)

- [ ] **Step 1: Replace the file header comment and `@theme inline` block**

Replace lines 7-60 with:

```css
/*
 * QA Workspace design system v2 — bright, high-contrast SaaS visual language.
 * Palette: white canvas, vivid signal blue primary, semantic status colors.
 * Neutrals and status colors are plain hex per the design spec (not oklch).
 */

@theme inline {
  --radius-sm: calc(var(--radius) - 3px);
  --radius-md: calc(var(--radius) - 1px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans:
    "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-ring-offset-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-strong: var(--surface-strong);
  --color-surface-hover: var(--surface-hover);
  --color-surface-selected: var(--surface-selected);
  --color-draft: var(--draft);
  --color-draft-foreground: var(--draft-foreground);
  --color-published: var(--published);
  --color-published-foreground: var(--published-foreground);
  --color-deprecated: var(--deprecated);
  --color-deprecated-foreground: var(--deprecated-foreground);
  --color-critical: var(--critical);
  --color-warning: var(--warning);
  --color-info: var(--info);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --shadow-panel: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04);
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 240ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

- [ ] **Step 2: Replace the `:root` block's non-sidebar tokens**

Replace lines 62-93 (everything from `--radius:` through `--info:`, keep `--sidebar*` lines below unchanged) with:

```css
:root {
  --radius: 0.625rem;
  --background: #ffffff;
  --foreground: #191f28;
  --card: #ffffff;
  --card-foreground: #191f28;
  --popover: #ffffff;
  --popover-foreground: #191f28;
  --primary: #3182f6;
  --primary-foreground: #ffffff;
  --secondary: #f2f4f6;
  --secondary-foreground: #333d4b;
  --muted: #f7f8fa;
  --muted-foreground: #4e5968;
  --accent: #f2f4f6;
  --accent-foreground: #191f28;
  --destructive: #f04452;
  --destructive-foreground: #ffffff;
  --border: #e5e8eb;
  --input: #d1d6db;
  --ring: #3182f6;
  --surface: #f7f8fa;
  --surface-strong: #f2f4f6;
  --surface-hover: #f2f4f6;
  --surface-selected: #f2f7ff;
  --draft: #f2f4f6;
  --draft-foreground: #6b7684;
  --published: #dff7ec;
  --published-foreground: #008a56;
  --deprecated: #fff0d9;
  --deprecated-foreground: #c65f00;
  --critical: #d92727;
  --warning: #f57c00;
  --info: #3182f6;
```

Leave the `--sidebar*` lines (currently lines 94-101) exactly as they are — the spec doesn't define nav chrome colors and §1 forbids touching the sidebar.

Note: `--draft`/`--draft-foreground` back the "not started" QA status (spec's Not Tested/Neutral), `--published`/`--published-foreground` back "verified" (spec's Pass/Success), `--deprecated`/`--deprecated-foreground` back "blocked" (closest to spec's Warning/Retest, since "blocked" isn't idle-neutral, it needs attention). `--critical`/`--warning`/`--info` stop being used by `badges.tsx` after Task 3 (which switches to explicit hex per spec §4's exact text/bg pairs) but are kept defined and exposed as `text-warning`/`bg-critical`/etc. Tailwind utilities — spec §14 calls for the same semantic colors on status *icons*, so Task 8's sweep can reach for them there instead of re-deriving the palette.

- [ ] **Step 3: Fix the `mono-token` utility so technical names use the UI font, not monospace**

Spec §2: "숫자, 영문 event name, property name도 별도의 monospace font를 기본 적용하지 않는다... 코드 블록, raw JSON, SQL 등 실제 코드 영역에서만 monospace를 사용한다." `mono-token` is applied to event/property names and counters across 9 files — fix it once here instead of touching every call site. Replace the `@utility mono-token` block (lines 160-164) with:

```css
@utility mono-token {
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
```

- [ ] **Step 4: Add the `status-badge` utility from spec §5**

Add this new block right after the `mono-token` utility:

```css
@utility status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
```

- [ ] **Step 5: Update `data-grid` hover to use the new hover token**

In the existing `@utility data-grid` block, change `& tbody tr:hover { background-color: var(--color-surface); }` to `background-color: var(--color-surface-hover);` (both currently resolve to the same gray, this just keeps naming consistent with Task 5).

- [ ] **Step 6: Verify**

Run: `npm run dev`, open the app. Background should be white, page text should be visibly dark (not gray), no build errors in the terminal.

- [ ] **Step 7: Commit**

```bash
git add src/styles.css
git commit -m "design: replace core tokens with v2 design system palette"
```

---

### Task 2: Switch the font from IBM Plex Sans to Pretendard

**Files:**
- Modify: `src/routes/__root.tsx:96-104`

- [ ] **Step 1: Read the current font `<link>` tags**

Run: `grep -n "fonts.googleapis\|preconnect" src/routes/__root.tsx`

- [ ] **Step 2: Replace the Google Fonts links with the Pretendard CDN**

Pretendard isn't on Google Fonts; it's distributed as a static CSS file via jsDelivr. Find the two `link` entries (`preconnect` to `fonts.googleapis.com` and the `stylesheet` with `family=IBM+Plex+Sans...`) and replace them with:

```ts
      { rel: "preconnect", href: "https://cdn.jsdelivr.net" },
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css",
      },
```

Keep the JetBrains Mono `preconnect`/`stylesheet` entries as-is if they're separate `link` objects in the same array — monospace is still needed for genuine code blocks (spec §2 "Code"). If IBM Plex Sans and JetBrains Mono were combined into a single `family=` query string, split them so only the IBM Plex Sans family is removed.

- [ ] **Step 3: Verify**

Run: `npm run dev`, open the app, open browser devtools → Network → filter `pretendard` → confirm the stylesheet loads (200). Inspect any heading with devtools → computed font-family should resolve to Pretendard Variable.

- [ ] **Step 4: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "design: load Pretendard, drop IBM Plex Sans"
```

---

### Task 3: Restyle badges to the spec's pill treatment

**Files:**
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/app/badges.tsx`

- [ ] **Step 1: Rewrite `ui/badge.tsx` to use the `status-badge` utility**

Replace the file's `badgeVariants` definition:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("status-badge border", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      destructive: "border-transparent bg-destructive text-destructive-foreground",
      outline: "border-border text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

- [ ] **Step 2: Rewrite `app/badges.tsx` to use pill shape + spec status colors**

Replace the whole file:

```tsx
import { cn } from "@/lib/utils";
import type { ItemStatus, Severity } from "@/lib/domain";
import { ITEM_STATUS_LABEL, SEVERITY_LABEL } from "@/lib/domain";

const base = "status-badge border border-transparent";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    critical: "text-[#D92727] bg-[#FDE8EA]",
    warning: "text-[#C65F00] bg-[#FFF0D9]",
    info: "text-[#1B64DA] bg-[#E8F3FF]",
  };
  return <span className={cn(base, styles[severity])}>{SEVERITY_LABEL[severity]}</span>;
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const styles: Record<ItemStatus, string> = {
    not_started: "bg-draft text-draft-foreground",
    verified: "bg-published text-published-foreground",
    failed: "text-[#D92727] bg-[#FDE8EA]",
    blocked: "bg-deprecated text-deprecated-foreground",
  };
  return <span className={cn(base, styles[status])}>{ITEM_STATUS_LABEL[status]}</span>;
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn(base, "border-border bg-surface-strong text-muted-foreground")}>
      {children}
    </span>
  );
}
```

(`critical`/`failed` use the explicit red-700-on-red-100 pair from spec §4 rather than `--destructive`, since `--destructive` is tuned as an action color at 600-weight, not the darker 700-weight text spec wants for status text-on-tint.)

- [ ] **Step 3: Verify**

Run: `npm run dev`, navigate to a QA round or taxonomy page with status/severity badges. Badges should render as full pill shapes, ~28px tall, with a colored tint background and 600-weight colored text — not tiny uppercase outlined chips.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/badge.tsx src/components/app/badges.tsx
git commit -m "design: restyle badges as spec status pills"
```

---

### Task 4: Update button, input, progress, and card primitives

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/progress.tsx`
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Add press feedback and vivid-blue CTA weight to `button.tsx`**

In `buttonVariants`, change the base class string (first argument to `cva`) from:

```tsx
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
```

to:

```tsx
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold cursor-pointer transition-[background-color,color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
```

Change the `default` variant from `"bg-primary text-primary-foreground shadow hover:bg-primary/90"` to `"bg-primary text-primary-foreground shadow-none hover:bg-[#2272EB] active:bg-[#1B64DA]"` (spec §9 exact hover/pressed blues).

- [ ] **Step 2: Give `input.tsx` the spec's focus treatment (§10 — P1 item 11)**

Change the `Input` className string from:

```tsx
"flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
```

to:

```tsx
"flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-base shadow-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[#8B95A1] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
```

(`ring-primary/15` approximates spec's `rgba(49, 130, 246, 0.14)` box-shadow via Tailwind's ring opacity modifier — visually equivalent to the spec's exact value.)

- [ ] **Step 3: Update `progress.tsx` height and track color**

Replace the file:

```tsx
"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-border", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-[transform] duration-[var(--motion-slow)] ease-[var(--ease-standard)]"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
```

- [ ] **Step 4: Remove the default card shadow**

In `card.tsx`, change the `Card` component's className from `"rounded-xl border bg-card text-card-foreground shadow"` to `"rounded-xl border bg-card text-card-foreground"` (spec §12: no shadow by default; callers that need the accent shadow pass `className="shadow-panel"` explicitly — `--shadow-panel` is already defined in the theme from Task 1).

- [ ] **Step 5: Verify**

Run: `npm run dev`. Click a primary button — it should visibly shrink slightly on press. Focus an input — border should turn blue with a soft blue glow, not a hard ring. Cards should render with a border only, no drop shadow. Any progress bar should be thinner (6px) with a light gray track.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/input.tsx src/components/ui/progress.tsx src/components/ui/card.tsx
git commit -m "design: apply v2 motion, radius, focus, and shadow treatment to core primitives"
```

---

### Task 5: Table row states and coverage bar

**Files:**
- Modify: `src/components/ui/table.tsx:42-54`
- Modify: `src/components/app/coverage.tsx`

- [ ] **Step 1: Give `TableRow` distinct hover vs. selected surfaces**

Replace the `TableRow` component:

```tsx
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-surface-hover data-[state=selected]:bg-surface-selected",
        className,
      )}
      {...props}
    />
  ),
);
```

(Was `hover:bg-muted/50 data-[state=selected]:bg-muted` — both are now distinct tokens: `--surface-hover` is gray-100, `--surface-selected` is pale blue, matching spec §11.)

- [ ] **Step 2: Match the coverage bar height/track to the progress bar**

In `coverage.tsx`, change the track div's className from `"flex h-2 w-full overflow-hidden rounded-full bg-muted"` to `"flex h-1.5 w-full overflow-hidden rounded-full bg-border"`.

- [ ] **Step 3: Verify**

Run: `npm run dev`, open a table with selectable rows (e.g. QA round results). Hover should show a light gray tint; a selected row should show a pale blue tint, visibly different from hover.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/table.tsx src/components/app/coverage.tsx
git commit -m "design: distinct hover/selected surfaces for table rows and coverage bar"
```

---

### Task 6: Typography hierarchy in shared layout primitives

**Files:**
- Modify: `src/components/app/layout-parts.tsx`

- [ ] **Step 1: Bump `PageHeader` title to spec's Page Title scale (24px/700)**

Change `<h1 className="text-xl font-semibold tracking-tight">` to `<h1 className="text-2xl font-bold tracking-tight text-foreground">`.

- [ ] **Step 2: Bump `Panel` title to spec's Subsection minimum (16px/600)**

Change `<h2 className="text-sm font-semibold">` to `<h2 className="text-base font-semibold text-foreground">`.

- [ ] **Step 3: Bump `Stat` value to spec's Display scale (28px/700) for KPI numbers**

Change `<p className="mt-1 text-2xl font-semibold tabular-nums">` to `<p className="mt-1 text-[28px] font-bold tabular-nums text-foreground">`.

- [ ] **Step 4: Bump `EmptyState` title weight (Body Strong, 15px/600 minimum)**

Change `<p className="text-sm font-semibold">{title}</p>` to `<p className="text-[15px] font-semibold text-foreground">{title}</p>`.

- [ ] **Step 5: Verify**

Run: `npm run dev`, open any page using `PageHeader`/`Panel`/`Stat` (e.g. workspace dashboard). Page titles should read noticeably larger/bolder than section titles, which should read larger than body text — three clear steps, matching spec §16's before/after example.

- [ ] **Step 6: Commit**

```bash
git add src/components/app/layout-parts.tsx
git commit -m "design: strengthen page/section/stat typography hierarchy"
```

---

### Task 7: Minor cleanup — chart tooltip font

**Files:**
- Modify: `src/components/ui/chart.tsx:224`

- [ ] **Step 1: Switch the chart tooltip value from monospace to sans**

Change `className="font-mono font-medium tabular-nums text-foreground"` to `className="font-sans font-medium tabular-nums text-foreground"` (spec §2: numbers don't default to monospace).

- [ ] **Step 2: Verify**

Run: `npm run dev`, open any page rendering a chart with a tooltip, confirm the tooltip value no longer renders in a monospace face.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/chart.tsx
git commit -m "design: chart tooltip values use sans font, not monospace"
```

---

### Task 8: Guided page-level sweep

Tasks 1-7 changed the token layer and shared primitives, which cascades to every page automatically. What it can't fix from the foundation alone is **per-instance judgment calls** — spec §8's contrast rule ("최소 3단계의 명확한 텍스트 대비") and rule 1 ("일반적인 정보를 12px로 축소하지 않는다") apply differently depending on whether a given `text-xs` is legitimate Caption-tier metadata (spec allows 12px there) or mislabeled body text that needs to be `text-sm`/`text-[13px]`. This has to be checked against the running app, not guessed from source.

**Files to review** (found via `grep -rln "text-xs" src/components/app src/routes`, all consume the Task 1-7 primitives already):
- `src/components/app/attribute-api-settings.tsx`
- `src/components/app/badges.tsx` (re-check after Task 3 — labels now live inside `status-badge`, should already be fine)
- `src/components/app/qa-rounds-panel.tsx`
- `src/components/app/rules-tab.tsx`
- `src/components/app/stages-manager.tsx`
- `src/components/app/taxonomy-tab.tsx`
- `src/routes/_authenticated/w/$wsId/settings.tsx`
- `src/routes/_authenticated/w/$wsId/index.tsx`
- `src/routes/_authenticated/w/$wsId/route.tsx`
- `src/routes/_authenticated/w/$wsId/p/$projectId/index.tsx`
- `src/routes/_authenticated/w/$wsId/p/$projectId/route.tsx`
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx`
- `src/routes/_authenticated/workspaces.tsx`

- [ ] **Step 1: Run the dev server and walk each route above**

Run: `npm run dev`. Visit workspaces list → a workspace → a project → a QA stage → settings, in that order (matches the file list's nesting).

- [ ] **Step 2: Apply spec §8's 3-tier contrast check on each screen**

For each screen, confirm you can point to Primary (`text-foreground`, dark), Secondary (`text-muted-foreground`, mid), and Tertiary (explicit `text-[#8B95A1]` or `text-muted-foreground/70`) text — per spec §8's own example:
```
회원가입 완료                 ← Primary
회원가입이 정상적으로...       ← Secondary
sign_up · Custom Event         ← Tertiary
```
Where a `text-xs` element is truly the most minor metadata on the screen (e.g. a timestamp, a byline) — leave it, that's spec's allowed Caption tier. Where a `text-xs` is a row title, a field label, or anything a user scans for meaning — bump it to `text-sm` (14px) or `text-[13px]` per spec §2's type scale table, and if it's the primary label of its row, add `font-semibold` and `text-foreground`.

- [ ] **Step 3: Tint the failed-row background in the QA round results table**

In `qa-rounds-panel.tsx`, the `<TableRow key={item.id}>` around line 400 renders per-item QA results but has no visual distinction for failed items beyond the status badge. Find the row's status variable (`result?.status` or equivalent, check the surrounding `.map()` for the exact field name) and add a conditional className:

```tsx
<TableRow
  key={item.id}
  className={result?.status === "failed" ? "bg-[#FFF4F5]" : undefined}
>
```

(Use whatever the actual status field/values are named in that file — read the surrounding 20 lines first to match the real variable, don't guess a name that doesn't exist.)

- [ ] **Step 4: Re-check badge/severity colors against spec §4 in context**

On the taxonomy and rules pages, confirm severity badges read as clearly distinct pills (critical=red, warning=orange, info=blue) at a glance, not as similar-looking gray chips.

- [ ] **Step 5: Commit each fix as you make it**

```bash
git add -A
git commit -m "design: page-level contrast/typography sweep for <route name>"
```

(One commit per screen/file is fine — keep the diffs reviewable.)

---

**Scope note on spec §15/§17/§18 (P2 polish):** the check-icon bounce on a pass action, the exact 160-180ms modal/popover open transition, and "completion feedback" are tied to specific interactive flows (e.g. the verify-item action in `qa-rounds-panel.tsx`, whichever dialog/popover component the flow uses) rather than a shared primitive. Tasks 1-8 already give buttons, badges, and progress bars their motion tokens, which covers most of what a pass/fail action visually needs (badge color transition, progress bar increase, button press). The Radix dialog/popover components already import `tw-animate-css` (see `styles.css:3`), so open/close animation likely already exists via that library's `data-[state=open]:animate-in` classes — confirm this during Task 9's walkthrough before deciding whether dedicated work is needed here. Treat any remaining gap as a follow-up, not a blocker for this pass, since inventing a bespoke animation on an unreviewed interactive flow risks violating spec §18's "don't restructure existing components" constraint.

### Task 9: Final acceptance pass

- [ ] **Step 1: Walk spec §19's checklist against the running app**

Run: `npm run dev` and, for each item below, visit a representative screen and confirm:
- [ ] Shrinking the browser window still keeps title/body/metadata visually distinct
- [ ] No primary text reads as washed-out gray
- [ ] White is the dominant canvas color, not gray
- [ ] Passed/Failed/Retest/In-progress statuses are distinguishable by color alone
- [ ] Primary buttons/links read as vivid blue and stand out
- [ ] No screen is "all gray"
- [ ] Hovering a row/button and clicking it gives visible feedback
- [ ] Nothing feels janky or delayed (all transitions are ≤300ms)
- [ ] No layout, sidebar, or table-column change has occurred (diff review — see Step 2)

- [ ] **Step 2: Confirm no structural changes crept in**

Run: `git diff main --stat` (or the branch's merge-base) and confirm every changed file is one of the ones touched by Tasks 1-8 above — no route files reordered, no new/removed table columns, no sidebar width changes.

- [ ] **Step 3: Final commit / handoff**

If Step 2 turns up anything unexpected, fix it before considering the work done. Otherwise the branch is ready for review.
