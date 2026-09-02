# BFZ Swag Tracker

Interactive GitHub Pages prototype for a simple employee swag request and fulfillment workflow.

## Prototype scope

- No-login employee request form with an employee dropdown
- Guided category, product, and size selection
- Cart quantity controls and request confirmation
- Microsoft administrator sign-in concept
- Admin ticket, inventory, availability, and history views
- Representative catalog data derived from the supplied 132-row inventory export

The prototype is intentionally static: it does not authenticate, send requests, or write to Supabase.

## Delivery path

1. Review this prototype on GitHub Pages and approve the request/admin experience.
2. Add dedicated swag inventory and request tables to the existing Supabase project, with row-level security and a one-time JSON import path.
3. Connect the public request flow to the existing Employees table through a narrowly scoped server endpoint.
4. Configure Microsoft sign-in for `@bfzelectric.com`, deny `foreman@bfzelectric.com`, and enforce authorization on the server and in database policies.
5. Deploy the connected application to the existing Vercel project, test fulfillment and inventory deductions end to end, then retire the static mockup.

## Local development

```bash
npm install
npm run dev
```
