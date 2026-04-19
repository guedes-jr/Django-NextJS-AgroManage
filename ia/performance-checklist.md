# Performance Checklist

## Backend
- verify N+1 risks
- use indexes on high-cardinality filters
- paginate list endpoints
- use bulk operations for imports
- cache only where justified
- move expensive jobs to background tasks

## Frontend
- reduce rerenders
- split heavy modules
- optimize large tables and charts
- avoid duplicated requests
- use server rendering strategically
