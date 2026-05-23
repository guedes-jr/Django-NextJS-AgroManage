# AgroManage - Quick Reference Guide

## Project at a Glance

**Full Name:** Django-NextJS-AgroManage
**Type:** Enterprise Agricultural Management SaaS
**Status:** Production-Ready (Clinical module partially integrated)
**License:** MIT

---

## 1. Technology Stack

### Backend
| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.12 | Runtime |
| Django | 5.0 | Web framework |
| DRF | 3.15 | REST API |
| PostgreSQL | 16 | Primary database |
| Redis | 7 | Cache & message queue |
| Celery | 5.3 | Async tasks |

### Frontend
| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20+ | Runtime |
| Next.js | 16.2.4 | Framework with App Router |
| React | 19.2.4 | UI library |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Styling |
| Bootstrap | 5.3.8 | UI components |

---

## 2. Directory Structure at a Glance

```
Django-NextJS-AgroManage/
├── backend/                    # Django project (port 8000)
│   ├── apps/                   # 11 Django apps
│   │   ├── accounts/           # Users, auth, roles
│   │   ├── livestock/          # 13 models for animals
│   │   ├── farms/              # Farm & sector management
│   │   ├── crops/              # Field & harvest tracking
│   │   ├── inventory/          # Stock management
│   │   ├── finance/            # Transactions & accounts
│   │   ├── reports/            # Analytics & reporting
│   │   ├── tasks/              # Todo/task management
│   │   ├── notifications/      # Alerts system
│   │   ├── audit/              # Immutable logs
│   │   └── organizations/      # Multi-tenancy
│   ├── config/                 # Django settings
│   ├── common/                 # Shared utilities
│   ├── requirements/           # Dependencies (base/dev/prod)
│   └── manage.py
├── frontend/                   # Next.js project (port 3000)
│   └── src/
│       ├── app/                # Next.js App Router pages
│       │   ├── /home/          # Protected routes
│       │   │   ├── /rebanho/   # Livestock UI
│       │   │   ├── /clinico/   # Clinical/veterinary UI
│       │   │   ├── /estoque/   # Inventory UI
│       │   │   ├── /financeiro/# Finance UI
│       │   │   └── /relatorios/# Reports UI
│       │   └── /login/         # Auth pages
│       ├── components/         # Reusable UI components
│       ├── services/           # API client (Axios)
│       ├── hooks/              # React hooks
│       ├── types/              # TypeScript definitions
│       └── validators/         # Zod schemas
├── docker/                     # Dockerfile & Nginx config
├── scripts/                    # Setup, dev, migration scripts
└── Makefile                    # Development commands
```

---

## 3. Key API Endpoints

### Authentication
```
POST   /api/v1/auth/login/              - Login with credentials
POST   /api/v1/auth/token/refresh/      - Refresh JWT token
POST   /api/v1/auth/register/           - Create new user
```

### Livestock (Primary Module)
```
GET    /api/v1/livestock/batches/       - List animal batches
POST   /api/v1/livestock/batches/       - Create batch
GET    /api/v1/livestock/animals/       - List individual animals
POST   /api/v1/livestock/animals/       - Create animal record
GET    /api/v1/livestock/vaccinations/  - List vaccine records
POST   /api/v1/livestock/vaccinations/  - Record vaccine application
GET    /api/v1/livestock/weights/       - Weight history
POST   /api/v1/livestock/weights/       - Record weighing
GET    /api/v1/livestock/marras/        - Young females dashboard
GET    /api/v1/livestock/matrizes/      - Breeding females dashboard
GET    /api/v1/livestock/gestacoes/     - Pregnant animals dashboard
```

### Inventory
```
GET    /api/v1/inventory/items/         - List inventory items
GET    /api/v1/inventory/movements/     - Stock movements
GET    /api/v1/inventory/lots/          - Batch/lot tracking
```

### Finance
```
GET    /api/v1/finance/transactions/    - List transactions
POST   /api/v1/finance/transactions/    - Record transaction
GET    /api/v1/finance/accounts/        - Bank accounts
```

### Reports
```
GET    /api/v1/reports/generated/       - List generated reports
POST   /api/v1/reports/generate/        - Generate new report
GET    /api/v1/reports/schedules/       - Scheduled reports
```

---

## 4. Database Models Inventory

### Core Infrastructure
- `User` (5 roles: OWNER, ADMIN, MANAGER, OPERATOR, VIEWER)
- `Organization` (multi-tenancy)
- `AuditLog` (immutable)

### Farm Management
- `Farm` (properties)
- `Sector` (areas within farm)

### Livestock (13 models)
1. `Species` - Animal types
2. `Breed` - Breed per species
3. `AnimalBatch` - Lots/groups
4. `Animal` - Individual records
5. `Mating` - Breeding events
6. `Pregnancy` - Confirmed pregnancies
7. `Birth` - Birth records
8. `Litter` - Piglet groupings
9. `Incubation` - Egg incubation
10. `VaccinationRecord` - Vaccines
11. `WeightRecord` - Weight tracking
12. `HealthRecord` - Clinical records
13. `FeedingRecord` - Feed consumption

### Crops
- `Field` - Agricultural plots
- `PlantingCycle` - Crop cycles
- `Harvest` - Harvest records

### Inventory
- `ItemEstoque` - Master catalog
- `LoteEstoque` - Lot tracking
- `MovimentacaoEstoque` - Stock movements

### Finance
- `FinancialCategory` - Category hierarchy
- `BankAccount` - Organization accounts
- `Transaction` - Revenue/expense

### Reporting
- `ReportConfig` - Report templates
- `ReportSchedule` - Automated generation
- `GeneratedReport` - Generated instances
- `ReportWidget` - Dashboard widgets

### Tasks & Notifications
- `Task` - Todos/assignments
- `Notification` - In-app alerts
- `NotificationPreference` - User settings
- `NotificationTemplate` - Message templates

---

## 5. User Roles & Permissions

| Role | Login | View | Create | Edit | Delete | Manage Users |
|------|-------|------|--------|------|--------|--------------|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| OPERATOR | ✅ | ✅ | ✅ | ✅ | - | - |
| VIEWER | ✅ | ✅ | - | - | - | - |

---

## 6. Frontend Routes

### Public Routes
- `/` - Redirect
- `/login` - Authentication
- `/register` - New account

### Protected Routes (under `/home`)
- `/` - Main dashboard
- `/rebanho` - Livestock management
  - `/marras` - Young females
  - `/matrizes` - Breeding stock
  - `/gestacoes` - Pregnancies
  - `/reprodução` - Reproduction dashboard
- `/clinico` - Veterinary/clinical
  - `/consultas` - Consultations
  - `/vacinacao` - Vaccinations
  - `/medicamentos` - Medications
  - `/exames` - Exams
- `/estoque` - Inventory
- `/financeiro` - Finance
- `/relatorios` - Reports
- `/profile` - User profile
- `/usuarios` - User management
- `/settings` - Organization settings

---

## 7. Common Commands

### Development
```bash
make setup          # First-time setup (venv, deps, migrations)
make dev            # Start Django + Next.js with hot reload
make debug          # Start with debuggers attached
make stop           # Stop all services
make test           # Run test suite with coverage
make lint           # Check code style
make format         # Auto-format code
```

### Database
```bash
make migrations     # Create migration files
make migrate        # Apply migrations
make seed           # Load demo data
make reset-db       # Recreate from scratch
make dbshell        # PostgreSQL shell
```

### Git (with Conventional Commits)
```bash
make commit-feat msg="description"      # ✨ New feature
make commit-fix msg="description"       # 🐛 Bug fix
make commit-docs msg="description"      # 📚 Documentation
make commit-db msg="description"        # 🗃️ Migration
make ship-feat msg="description"        # Commit + push feature
```

### Docker
```bash
make docker-dev     # Development with hot reload
make docker-prod    # Production build
make docker-down    # Stop containers
```

---

## 8. Authentication Details

### JWT Token Configuration
- **Access Token Lifetime:** 2 hours
- **Refresh Token Lifetime:** 7 days
- **Token Type:** Bearer
- **Rotation:** Enabled (new refresh on each use)
- **Blacklist:** Enabled after rotation

### Token Storage
- **Access Token:** LocalStorage (`access_token`)
- **Refresh Token:** LocalStorage (`refresh_token`)
- **Automatic Refresh:** Via Axios interceptor on 401
- **CORS:** Enabled for localhost:3000

---

## 9. Livestock Module Specifics

### Animal Categories (Cattle Example)
- Bezerro (calf)
- Garrote (young bull)
- Novilha (young heifer)
- Touro (bull)
- Vaca (cow)
- Matriz (breeding female)

### Animal Phases
- Creche (nursery)
- Crescimento (growth)
- Engorda (fattening)
- Gestação/Maternidade (pregnancy/nursing)
- Reprodução (breeding)

### Reproductive Status
- Vazia (empty/not pregnant)
- Em Preparo (in preparation)
- Pronta (ready for breeding)
- Coberta (covered/bred, awaiting diagnosis)
- Gestante (pregnant)
- Lactante (nursing)
- Descanso (rest)
- Ativa (active - males)

### Batch Status
- ACTIVE (in production)
- SOLD (exited)
- FINISHED (completed cycle)
- DEAD (mortality)

---

## 10. Clinical Module Status

### Implemented (Backend)
- ✅ HealthRecord model (MEDICACAO, EXAME, CIRURGIA, OUTRO)
- ✅ VaccinationRecord (doses, schedules)
- ✅ WeightRecord (tracking)
- ✅ FeedingRecord (diet management)
- ✅ API endpoints for all above

### Partially Implemented (Frontend)
- ⏳ Skeleton UI with tabs
- ⏳ Static KPI cards
- ❌ Data fetching
- ❌ CRUD forms
- ❌ Scheduling system
- ❌ Report generation

---

## 11. Development Workflow

### Starting Work
```bash
git checkout -b feature/my-feature
make setup              # If first time
make dev                # Start dev servers
```

### Making Changes
```bash
# Backend: Create models → migrations → serializers → views → tests
python manage.py makemigrations
python manage.py migrate

# Frontend: Create pages → components → hooks → services
npm run dev            # Should hot reload

# Git: Commit with type
make commit-feat msg="add cool feature"
```

### Before Push
```bash
make lint              # Check style
make format            # Auto-fix formatting
make test              # Run tests
make commit-feat msg="..."
make push
```

---

## 12. Environment Variables

### Backend (.env)
```bash
DJANGO_SECRET_KEY=your-secret-key
DJANGO_SETTINGS_MODULE=config.settings.dev
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgres://user:pass@localhost:5432/agrodb
REDIS_URL=redis://localhost:6379/0
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_NAME=AgroManage
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 13. File Upload & Media

### Directories
- `/media/` - User uploads (avatars, receipts, etc.)
- `/staticfiles/` - Static assets in production
- `/media/avatars/` - User profile pictures
- `/media/org_logos/` - Organization logos
- `/media/finance/receipts/` - Financial documents

### Supported Upload Types
- Images: `.jpg`, `.png`, `.gif` (via Pillow)
- Files: `.pdf`, `.xlsx`, `.csv` (for reports/attachments)

---

## 14. Performance & Optimization

### Database Optimization
- Indexed fields: email, organization_name, created_at
- Foreign key relationships properly indexed
- Pagination default 20 items, max 100
- Search + filter on all list endpoints

### Frontend Optimization
- Next.js Image component for optimization
- Code splitting via dynamic imports
- CSS-in-JS via Tailwind (atomic CSS)
- Axios request/response caching possible

### Caching
- Redis for Celery task queue
- Frontend: localStorage for tokens
- Backend: Can add Redis cache layer

---

## 15. Testing Quick Start

### Run Tests
```bash
make test                   # Full suite with coverage
make test-fast             # No coverage (faster iteration)
```

### Test Structure
```
/backend/tests/
├── conftest.py            # Pytest fixtures
├── test_auth.py
├── test_livestock.py
└── test_finance.py
```

### Fixtures Available
- User fixtures with various roles
- Organization fixture
- Farm fixture
- Animal batch fixtures

---

## 16. Troubleshooting

### Port Already in Use
```bash
make stop                  # Kill processes
# Or manually:
kill -f 8000 3000 5678 9229
```

### Database Connection Error
```bash
# Check PostgreSQL is running
psql -U agromanage_user -d agromanage_db

# Or recreate
make reset-db
```

### Frontend Can't Reach Backend
Check:
1. Backend is running: `http://localhost:8000`
2. CORS configured for `http://localhost:3000`
3. Check `.env.local` has correct API_URL

### Token Refresh Issues
```bash
# Clear browser storage
localStorage.clear()
# Or reload and login again
```

---

## 17. Documentation Links

### In Project
- `README.md` - Setup & commands
- `PROJECT_ARCHITECTURE_ANALYSIS.md` - Detailed architecture
- `/ia/` - AI context & guidelines
- `/docs/` - Additional documentation

### External
- Django Docs: https://docs.djangoproject.com/
- Next.js Docs: https://nextjs.org/docs
- DRF Docs: https://www.django-rest-framework.org/
- PostgreSQL Docs: https://www.postgresql.org/docs/

---

## 18. Support & Contribution

### Coding Standards
See `/ia/coding-standards.md` for:
- Python style guide (PEP 8)
- TypeScript/React best practices
- Git commit conventions
- File organization patterns

### Performance Targets
- API response < 200ms (avg)
- Page load < 3s
- Test coverage > 80%

---

**Last Updated:** 2026-05-22
**Maintained By:** AgroManage Development Team
**Questions?** Check the detailed architecture analysis document
