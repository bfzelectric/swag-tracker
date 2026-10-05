# Design notes and reusable styles

## Identity

Use the SWG rounded-square app mark: charcoal `#111317`, yellow `#ffd100` text,
approximately 9px corner radius. `Brand` in `shared-controls.tsx` and
`public/favicon.svg` must remain visually consistent. This is intentionally distinct
from BFZ's corporate logo. Header wording is “BFZ SWAG TRACKER”.

Typography uses Geist-named semantic font tokens for compatibility with the BFZ program
family. The current tokens resolve to system Sans/Mono fallbacks (there is no downloaded
Geist font in this repo). Preserve this appearance unless explicitly changing typography.
Inventory body text is 14px. Avoid narrow display fonts.

## Reuse contract

`styles/tokens.css` defines semantic dark/light variables. Use `--background`,
`--foreground`, `--card`, `--primary`, `--primary-foreground`, `--secondary`,
`--muted-foreground`, `--border`, `--ring`, `--warning` and `--shadow` instead of
new hardcoded theme colors. Brand colors stay fixed across themes.

`styles/elements.css` provides base element defaults. `styles/primitives.css` provides reusable `.ui-panel`, `.ui-input`, `.ui-label`,
`.ui-stack`, `.ui-row`, `.ui-button`, `.ui-button--primary`, `.ui-button--danger`,
`.ui-message`, `.ui-message--error`, `.ui-muted` and `.ui-table-wrap` classes.
Copy tokens and elements together when sharing this foundation with another app;
set the font variables there. These CSS classes do not require React or Tailwind.
Existing React `Button`/`Textarea` primitives remain in `components/ui`.

```tsx
<section className="ui-panel ui-stack">
  <label className="ui-label" htmlFor="example">Label</label>
  <input className="ui-input" id="example" />
  <button className="ui-button ui-button--primary">Save</button>
</section>
```

App-specific styles remain in `styles/swag.css`; do not copy inventory-grid or ticket
layout rules into general components. Existing selectors share universal surfaces,
focus treatment and form controls where compatible without changing their layout.

## Interaction/accessibility

Employee results appear below the input, filter while typing and support arrows,
Enter and Escape. Keep combobox/listbox semantics and meaningful labels on icon buttons.
Quantity steppers use equal-size centered touch targets. Keep visible keyboard focus,
disabled states and reduced-motion support. Tables may scroll horizontally on mobile;
do not shrink all stock columns into unreadable text. Breakpoints: 920px and 650px.

Theme is stored as `bfz-swag-theme`. Verify both themes and a narrow viewport after
visual changes. Admin view code is lazy-loaded; don't pull it back into the public bundle.
