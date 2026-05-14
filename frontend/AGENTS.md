<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:dev-server -->
# Dev Server — CPU fix

Turbopack (default bundler) causes high CPU usage (~500%) with Tailwind v4.
Always use webpack instead:

```bash
npx next dev --webpack
# or
npm run dev -- --webpack
```
<!-- END:dev-server -->
