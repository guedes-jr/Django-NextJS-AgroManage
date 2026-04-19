# Architecture

## Recommended Backend Structure
- config/
- apps/
  - accounts/
  - organizations/
  - farms/
  - livestock/
  - crops/
  - inventory/
  - finance/
  - reports/
  - audit/
  - integrations/
- common/
- tests/

## Recommended Frontend Structure
- src/
  - app/
  - components/
  - features/
  - services/
  - hooks/
  - lib/
  - validators/
  - types/

## Core Principles
- organize by domain
- isolate business orchestration from transport layer
- keep API contracts explicit
- favor reusable UI patterns
- support future multi-tenant expansion
