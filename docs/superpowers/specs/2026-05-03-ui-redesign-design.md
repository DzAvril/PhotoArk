# PhotoArk UI Redesign Design Spec

## Goal

Redesign PhotoArk into a polished operational console for NAS photo backup, media browsing, synchronization, audit history, and system configuration. The redesign must cover the whole web app on desktop and mobile, not just restyle the current screens.

## Chosen Direction

The approved visual direction is **Operational Console with polished analytics**.

This means:

- The product should feel like a mature NAS management and synchronization console.
- It should be visually refined, but still practical and dense enough for repeated daily use.
- The UI should avoid marketing-page composition, oversized decorative sections, card-heavy page stacking, and large decorative gradient backgrounds.
- The home page should prioritize analytics and system understanding.
- Desktop and mobile must both feel intentionally designed.

## Product Information Architecture

The app should move from feature-page stacking to workflow-oriented navigation. Existing legacy paths should continue to work through redirects.

Primary navigation:

- **Overview** (`/`): System status, analytics, capacity, media distribution, trends, sync summary, risk list, and recent activity.
- **Media Library** (`/media`): Storage selection, filtering, media grid, Live Photo preview, and media metadata.
- **Sync** (`/sync`): Diff checking, sync jobs, and active executions. The default tab should be diff checking. Existing `/diff`, `/jobs`, and `/settings/jobs` should redirect to the right sync subview.
- **Records** (`/records`): Execution history, backup audit records, failure detail, and traceable run logs.
- **Settings** (`/settings`): Notifications, storage configuration, and advanced maintenance only. Jobs should move out of settings because job management belongs to the sync workflow.

Mobile navigation:

- Keep five bottom navigation entries matching the primary workflow.
- Use sticky page toolbars and segmented tabs for secondary navigation.
- Use sheets or drawers for filters and row details instead of squeezing desktop sidebars into mobile width.

## Visual System

The visual system should be neutral, crisp, and readable.

Color:

- Replace the current warm beige and heavy dark blue feel with a neutral light gray-blue workspace.
- Use white and light gray surfaces for panels.
- Keep teal as the PhotoArk primary color, but use it sparingly for selected navigation, primary actions, and key focus states.
- Use status colors consistently: green for success, amber for warning, red for danger, blue for information.
- Dark mode should remain, but should be low-saturation graphite rather than glowing blue-black.

Shape and elevation:

- Use card and panel radii around `8px`.
- Use button and input radii around `6px` to `8px`.
- Reduce `rounded-2xl` and pill usage except for badges/chips.
- Avoid cards inside cards.
- Use shadows only for overlays, dialogs, drawers, and subtle hover elevation.

Typography:

- Page titles: 24-28px.
- Section headings: 16-18px.
- Card titles: 14-16px.
- Tables, forms, and toolbar labels: 13-14px.
- Metric numbers may be larger but must not overpower the main task area.
- Avoid viewport-scaled typography and negative letter spacing.

Charts and analytics:

- Overview charts should look refined, but must remain legible and labeled.
- Use charts to explain capacity, growth, media distribution, and activity.
- Do not use gradients as decoration when a chart, table, or status module would communicate more.

Motion:

- Keep light page transitions, hover feedback, loading indicators, and modal/drawer entrance transitions.
- Avoid motion that slows down repeated work.
- Respect reduced-motion preferences.

## Component System

The redesign should consolidate UI language into reusable components instead of scattering inline Tailwind across pages.

Core components:

- `AppShell`: Desktop side rail plus page header; mobile bottom navigation plus sticky page toolbar.
- `PageHeader`: Unified title, description, status chips, and primary actions.
- `Surface`, `Panel`, `Card`: Clear distinction between page sections, repeated item cards, and floating surfaces.
- `Button`, `IconButton`, `ToolbarButton`: Consistent size, icon placement, loading state, danger state, and disabled state.
- `Field`, `TextInput`, `Select`, `PathPicker`: Consistent label, help text, validation, density, and mobile touch target.
- `SegmentedControl`, `Tabs`: Shared control for filters and secondary navigation.
- `DataTable`, `MobileList`: Shared table/list definitions where possible, with desktop table rows and mobile cards.
- `MetricTile`, `StatusBadge`, `ProgressBar`: Shared status and metric patterns across Overview, Records, and Sync.
- `EmptyState`, `LoadingState`, `ErrorState`: Unified no-data, loading, long-loading, retry, and error treatment.
- `Modal`, `Drawer`: Desktop dialogs and mobile sheets for previews, confirmations, details, and row actions.

Component rules:

- Repeated entities should use cards only when they are actual repeated items.
- Page sections should be unframed layouts or single surfaces, not nested decorative cards.
- Buttons with common actions should use lucide icons and tooltips where labels are hidden.
- Form controls should support keyboard and mobile touch ergonomics.

## Key Page Designs

### Overview

The home page should use the approved **Analytics Board First** structure.

Layout:

- Top metric strip with storage count, active jobs, failed runs, pending diffs, media volume, and capacity risk.
- Main analytic region with media date distribution, storage capacity distribution, and growth/activity trends.
- Secondary region with sync topology summary and risk list.
- Recent activity and running jobs should remain visible, but should not dominate the first screen.

Actions:

- Contextual actions should include view diff, start sync, rebuild media index, and open relevant configuration.
- Long-running analytics loading must show clear state and not look frozen.

### Media Library

Desktop:

- Left filter/sidebar with storage selector, type filter, date range, search, thumbnail size, and loaded count.
- Main media grid optimized for scanning.
- Preview opens in a modal or side panel with clear next/previous, Live Photo controls, and metadata.

Mobile:

- Storage and filters should open in a sheet.
- Grid should adapt to two or three columns based on width.
- Preview should be full-screen with touch-friendly controls and metadata drawer.

### Sync

The new `/sync` page should own diff checking and job management.

Structure:

- Top segmented tabs: `Diff Check`, `Sync Jobs`, `Running`.
- Diff Check tab: task selector, filters, left/right diff grid, detail/action panel.
- Sync Jobs tab: create/edit jobs, source/destination paths, schedules, watch mode, enabled status.
- Running tab: queued/running executions with progress and cancel controls.

Compatibility:

- `/diff` redirects to `/sync`.
- `/jobs` and `/settings/jobs` redirect to the sync jobs tab.

Mobile:

- Use a single-column flow.
- Tapping a diff item opens a drawer with file metadata and actions.
- Job creation/editing uses a full-screen or bottom sheet form.

### Records

Records should become an audit-oriented page.

Layout:

- Top summary for success, failure, running, average duration, and files processed.
- Filterable data table on desktop.
- Mobile list cards with status, duration, file counts, and quick error expansion.
- Failure details should be prominent and easy to copy or inspect.

### Settings

Settings should only hold system configuration.

Sections:

- Notifications: Telegram settings and test message.
- Storage: storage targets, capacity, type, path, encryption, and health hints.
- Advanced: media index, diagnostics, and maintenance actions.

Jobs should be removed from settings navigation and owned by Sync.

### Login and Bootstrap

The login and first-user bootstrap screens should become calm product entry screens, not marketing-style landing pages.

Requirements:

- Show PhotoArk identity, one short product description, and the auth form.
- Keep visual polish restrained.
- Form errors must be close to the field or form action.
- Mobile should fit without awkward vertical scrolling.

## Interaction Requirements

- Frequent actions must be visible without explanatory copy.
- Long-running operations must use stable loading states and delayed long-running hints.
- Errors must provide retry or next action where possible.
- Desktop filters and secondary navigation should stay visible.
- Mobile filters should move into sheets, with active filters reflected as chips.
- Table row actions should use icons and tooltips on desktop.
- Mobile row actions should use a menu, drawer, or bottom action region.
- Preview experiences should support keyboard and touch navigation.
- Text must not overflow buttons, cards, sidebars, or mobile bottom nav.
- Color-only status indicators must include text labels.

## Accessibility Requirements

- Interactive icon-only controls require `aria-label`.
- Modals and drawers require focus management.
- Keyboard navigation must remain possible for navigation, filters, table actions, and modal controls.
- Focus rings must be visible in light and dark themes.
- The UI must avoid relying on color alone for status.
- Reduced motion should disable nonessential animations.

## Technical Constraints

- Keep the current React, TypeScript, Tailwind, lucide-react, framer-motion, React Query, and router stack.
- Do not introduce a large external UI framework.
- Prefer local reusable components over new dependencies.
- Keep API contracts stable unless a UI need exposes a real contract gap.
- Preserve existing business logic while moving jobs into the sync workflow.
- Maintain old route redirects.

## Testing and Verification

Required commands:

- `npm test`
- `npm run typecheck`
- `npm run build`

Browser verification:

- Desktop viewport around 1440x900.
- Tablet/mobile viewport around 390x844.
- Check `/`, `/media`, `/sync`, `/records`, `/settings`, and login/bootstrap.
- Check legacy routes `/diff`, `/jobs`, `/settings/jobs`, and `/storages`.

Visual QA checklist:

- No large beige, purple-blue, or dark-blue one-note palette.
- No decorative gradient/orb backgrounds.
- No card-inside-card layouts.
- No text overlap or clipped button labels.
- No mobile bottom navigation overlap with page content.
- No stale loading state that looks like a frozen screen.
- Empty, error, loading, and long-loading states are visibly distinct.

## Implementation Strategy

Implement in layers:

1. Navigation and layout foundation.
2. Design tokens and primitive components.
3. Shared table, list, form, modal, drawer, and state components.
4. Overview analytics board.
5. Media Library redesign.
6. Sync workflow with diff, jobs, and running tabs.
7. Records redesign.
8. Settings redesign.
9. Login/bootstrap redesign.
10. Browser QA and polish pass.

Each layer should be independently testable and should avoid mixing unrelated business logic changes into visual refactor commits.
