# Project structure

Everything maintained for this app belongs in this repository; no extra wrapper folder
is needed. Clone it into any directory on the new machine.

```text
swag-tracker/
├── AGENTS.md                  Codex onboarding and invariant checklist
├── README.md                  Human entry point
├── app/                       Route, document metadata, CSS entry point
│   ├── page.tsx               Public/admin switch; lazy admin loading
│   ├── layout.tsx             Metadata and initial theme
│   └── globals.css            Tailwind + stylesheet imports
├── features/swag/
│   ├── public-order.tsx       Employee → product → size → cart → request
│   ├── admin-workspace.tsx    Auth, database operations and admin views
│   ├── order-editor.tsx       Administrator create/edit order form
│   ├── shared-controls.tsx    Brand, theme, category icon, employee search
│   ├── model.ts               Pure catalog, label and draft helpers
│   ├── types.ts               Shared domain types
│   ├── baseline.ts            Lazy historical inventory snapshot loader
│   └── demo-data.ts           Fictional offline preview employees/orders
├── components/ui/             Reusable shadcn/Base UI primitives
├── styles/
│   ├── tokens.css             Dark/light semantic color and font variables
│   ├── elements.css           Base element defaults
│   ├── primitives.css         Portable universal UI classes
│   └── swag.css               App-specific layouts, controls and breakpoints
├── lib/                       Shared Supabase client and class-name utility
├── hooks/                     Starter shared hooks
├── data/inventory-baseline.json Historical import; NOT live stock
├── public/                    Favicon and social preview assets
├── supabase/migrations/        App-owned schema and RPC history
├── tests/                     Pure model tests and isolated SQL smoke test
├── docs/                      Portable project handbook
└── .github/workflows/          GitHub Pages preview and quality checks
```

Root configuration includes `package.json`, the lockfile, TypeScript, Vite/vinext,
Vercel and shadcn configuration. `.openai/hosting.json` is existing preview-tool
configuration used by Vite; it is not a credential file or conversational memory.

Generated/local folders (`node_modules`, `dist`, `.wrangler`, `.vercel`, `.env*`)
stay untracked. The UI starter library is retained for compatibility; only directly
imported modules enter the app bundle. Do not edit the entire catalog for a narrow task.
