# UI Guidelines

Design rules and component patterns for Multica. Follow these when adding new screens or modifying existing ones.

---

## 1. Layout Patterns

### List Panel Pages (2-panel layout)
Used by: Agents, Skills, Runtimes, Inbox

```
┌────────────────────┬──────────────────────────────────┐
│   List panel       │   Detail panel                   │
│   (280px default)  │   (flex-1)                       │
│   min: 240px       │   min: 50%                       │
│   max: 400px       │                                  │
└────────────────────┴──────────────────────────────────┘
```

- Use `ResizablePanelGroup` with `preserve-pixel-size` on the list panel
- List panel must overflow-y-auto with a fixed header (`h-12`)
- Detail panel shows empty state when nothing is selected

### Full-Page List (Projects)
Header bar + table/list body below. No detail panel.

### Issues / My Issues
Dual-header layout: workspace breadcrumb row + filter/controls row.

---

## 2. Page Header — `PageListHeader`

All list panel pages use the shared `PageListHeader` component from `packages/views/common/page-list-header.tsx`.

```tsx
import { PageListHeader } from "../../common/page-list-header";

<PageListHeader
  title="Agents"
  count={5}         // optional — shows muted count next to title
  actions={<Button>...</Button>}  // optional right-side buttons
/>
```

**Rules:**
- Height: `h-12` (48px), always `shrink-0`
- Title: `text-sm font-semibold` — never `font-medium`
- Count: `text-xs text-muted-foreground tabular-nums`
- Right actions: `flex items-center gap-1`
- Border: `border-b`
- Padding: `px-4`

**Create action button style by layout:**
| Layout | Button style | Example |
|--------|-------------|---------|
| 2-panel list panel | `ghost + icon-xs` with Plus icon | Agents, Skills |
| Full-page list | `ghost + icon-xs` with Plus icon | Projects |
| Has extra context | Dropdown / DropdownMenu | Inbox batch actions |

---

## 3. Empty State

Use the `Empty` component family from `packages/ui/components/ui/empty.tsx`.

```tsx
<Empty>
  <EmptyMedia>
    <IconName className="h-10 w-10 text-muted-foreground/30" />
  </EmptyMedia>
  <EmptyTitle>No items yet</EmptyTitle>
  <EmptyDescription>Optional helper text.</EmptyDescription>  {/* optional */}
  <EmptyContent>
    <Button onClick={onCreate} size="xs">
      <Plus className="h-3 w-3" />
      Create Item
    </Button>
  </EmptyContent>
</Empty>
```

**Rules:**
- Icon: always `h-10 w-10 text-muted-foreground/30`
- CTA button: always `size="xs"` — never `size="sm"` or `variant="outline"` standalone
- CTA includes a `Plus` icon (`h-3 w-3`)
- Empty state for "select something" (right panel): no CTA needed, or CTA from left panel

---

## 4. Loading State

### 2-Panel Loading Skeleton
```tsx
<div className="flex flex-1 min-h-0">
  {/* List skeleton */}
  <div className="w-72 border-r">
    <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-6 w-6 rounded" />
    </div>
    <div className="divide-y">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  </div>
  {/* Detail skeleton */}
  <div className="flex-1 p-6 space-y-6">
    {/* ... */}
  </div>
</div>
```

**Rules:**
- Skeleton header must also have `shrink-0`
- Use `Array.from({ length: 3 })` or `4` — match real item count approximately
- Full-page list: row skeletons (`Skeleton className="h-11 w-full"`)

---

## 5. List Item Selection Pattern

For interactive list items (Agents, Skills, etc.):
```tsx
<button
  onClick={() => setSelectedId(item.id)}
  className={cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
    isSelected ? "bg-accent" : "hover:bg-accent/50",
  )}
>
```

**Rules:**
- Selected: `bg-accent`
- Hover: `hover:bg-accent/50`
- Use `button` element, not `div`
- Full-width: `w-full`
- Text alignment: `text-left`

---

## 6. Typography

| Element | Class |
|---------|-------|
| Page title (h1) | `text-sm font-semibold` |
| Section heading | `text-xs font-medium text-muted-foreground uppercase tracking-wider` |
| Item name / primary text | `text-sm font-medium` |
| Secondary text / description | `text-xs text-muted-foreground` |
| Timestamp | `text-xs text-muted-foreground tabular-nums` |
| Badge/label | `text-xs` |

---

## 7. Button System

Variants from `packages/ui/components/ui/button.tsx`:

| Variant | Use case |
|---------|----------|
| `default` | Primary CTA (Create, Save, Submit) |
| `outline` | Secondary action, dialog footer cancel alternative |
| `ghost` | Toolbar icon buttons, list actions |
| `secondary` | Active toggle state |
| `destructive` | Delete / irreversible action confirmation |
| `link` | Inline text links |

Sizes:
| Size | Use case |
|------|----------|
| `default` | Main form buttons |
| `sm` | Dialog footers |
| `xs` | Inline actions, empty state CTA |
| `icon-xs` | Toolbar icon-only buttons (16px padding) |
| `icon` | Standard icon button (standard padding) |

---

## 8. Dialog / Modal

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-sm" showCloseButton={false}>
    <DialogHeader>
      <DialogTitle className="text-sm font-semibold">Title</DialogTitle>
      <DialogDescription className="text-xs">Description</DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
      <Button onClick={handleConfirm}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Rules:**
- Confirmation/destructive dialogs: `max-w-sm`, `showCloseButton={false}`
- Footer: Cancel on left (`ghost`), confirm on right (`default` or `destructive`)
- Delete confirmation: use destructive alert icon (`AlertCircle`) in a `rounded-full bg-destructive/10` container

---

## 9. Feedback Interaction

| Scenario | Pattern |
|----------|---------|
| Save success | `toast.success("...")` |
| Save failure | `toast.error(e instanceof Error ? e.message : "...")` |
| Delete success | `toast.success("...")` |
| Mutation loading | `disabled={loading}` on button + text changes to `"Saving..."` / `"Creating..."` |
| Autosave status | Inline status indicator (see WikiEditor pattern) |

---

## 10. Icon Guidelines

- All icons from `lucide-react`
- Toolbar/action icons: `h-4 w-4` inside `icon-xs` buttons
- List item icons: `h-4 w-4 text-muted-foreground`
- Empty state icons: `h-10 w-10 text-muted-foreground/30`
- Status dots: `h-2 w-2 rounded-full` or `h-2.5 w-2.5 rounded-full`
- Keep outline style consistent — do not mix filled and outline variants

---

## 11. Color Rules

- Use semantic tokens only: `bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-accent`, `bg-muted`, `text-primary`, etc.
- Never hardcode Tailwind color values (`text-red-500`, `bg-gray-100`)
- Exception: semantic status colors allowed — `text-green-500` for "online/success", `bg-emerald-500` for progress bars

---

## 12. Code Rules

- Comments in code must be **English only** (per CLAUDE.md)
- No Korean, Japanese, or other non-English text in source code
- Import `cn` from `@multica/ui/lib/utils` whenever conditional classes are needed

---

## 13. Shared Components Index

| Component | Location | Purpose |
|-----------|----------|---------|
| `PageListHeader` | `packages/views/common/page-list-header.tsx` | Standard h-12 header for list panels |
| `Empty`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` | `packages/ui/components/ui/empty.tsx` | Empty state screens |
| `Skeleton` | `packages/ui/components/ui/skeleton.tsx` | Loading placeholders |
| `ActorAvatar` | `packages/views/common/actor-avatar.tsx` | Member/agent avatar |
| `AppLink`, `useNavigation` | `packages/views/navigation/` | Cross-platform navigation |

---

## 14. Patterns NOT to repeat

- ❌ Inline `<div className="flex h-12 items-center ...">` header — use `PageListHeader`
- ❌ Empty state CTA with `size="sm" variant="outline"` — use `size="xs"`
- ❌ Page title with `font-medium` — use `font-semibold`
- ❌ `h-12` header without `shrink-0` in a flex column container
- ❌ `cn(...)` without importing `cn` from `@multica/ui/lib/utils`
- ❌ Korean/non-English comments in source code
