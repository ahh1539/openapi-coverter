# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server on port 8080
npm run build      # Production build
npm run build:dev  # Development build
npm run lint       # Run ESLint
npm run preview    # Preview built output
```

No test framework is installed.

## Architecture

This is a React + TypeScript web app that converts between **OpenAPI 3.x** and **Swagger 2.0** specifications bidirectionally, supporting both YAML and JSON formats.

**Tech stack:** React 18, Vite + SWC, Tailwind CSS, shadcn-ui (Radix UI), js-yaml.

### Core conversion logic

All conversion lives in `src/lib/converter.ts` (~1300 lines). The main exports:

- `convertSpecification()` — top-level entry point, dispatches by direction
- `convertOpenApiToSwagger()` — OpenAPI 3.x → Swagger 2.0
- `convertSwaggerToOpenApi()` — Swagger 2.0 → OpenAPI 3.x
- `detectSpecType()`, `isOpenApi3()`, `isSwagger2()` — spec detection
- `detectUnsupportedFeatures()` / `detectSwaggerUnsupportedFeatures()` — feature compatibility warnings

Key conversion concerns handled here:
- `anyOf`/`oneOf` schema flattening (OpenAPI → Swagger doesn't support these)
- `allOf` merging with `$ref` resolution
- Nullable: `nullable: true` ↔ `x-nullable: true`
- Reference paths: `#/components/schemas/` ↔ `#/definitions/`

### UI flow

`src/pages/Index.tsx` orchestrates the full user flow: input (paste or file upload) → direction selection → conversion → result display. Components are in `src/components/` with `ui/` holding shadcn primitives.

`src/lib/apiVisualizer.ts` parses a spec to extract endpoints for the visual endpoint browser.

### Path aliases

`@/` maps to `src/` (configured in `vite.config.ts` and `tsconfig.json`).
