# Backend Guidelines

- Use Django apps by domain
- Prefer DRF for APIs
- Keep non-trivial business logic in services or use cases
- Use selectors for complex reads
- Optimize querysets early
- Use transactions for critical write flows
- Use permissions explicitly
- Standardize pagination, filtering, and ordering
- Keep serializers thin
- Avoid heavy signal-based business flows
