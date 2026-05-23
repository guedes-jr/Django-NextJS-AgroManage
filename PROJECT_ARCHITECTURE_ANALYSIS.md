# AgroManage - Comprehensive Project Architecture Analysis

## Executive Summary

**AgroManage** is an enterprise-grade agricultural management platform built with Django 5 REST Framework (backend) and Next.js 14 (frontend). It supports complete farm operations management including livestock, crops, inventory, and finance with multi-tenant architecture and JWT authentication.

**Tech Stack:**
- **Backend:** Django 5.0, Django REST Framework, PostgreSQL 16, Redis, Celery
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Bootstrap 5.3
- **Infrastructure:** Docker Compose, Nginx, Gunicorn
- **Database:** PostgreSQL with 86+ migrations tracking comprehensive schema evolution

---

## 1. Project Type, Stack & Architecture

### Project Classification
- **Type:** Enterprise SaaS Agricultural Management System
- **Architecture:** Microservices-ready modular monolith with multi-tenant support
- **Deployment:** Docker containerized, reverse proxy via Nginx
- **Target Users:** Small to large agricultural enterprises in Brazil

### Technology Stack Details

#### Backend Stack
```
Core Framework      → Django 5.0.x
REST API            → Django REST Framework 3.15.x
Authentication      → SimpleJWT (JWT tokens, 2hr access, 7-day refresh)
Database            → PostgreSQL 16 with psycopg2-binary
Async Tasks         → Celery 5.3 with Redis broker
API Documentation   → drf-spectacular (OpenAPI/Swagger)
Validation          → Serializers + custom validators
CORS                → django-cors-headers for frontend integration
Filtering           → django-filter + DRF SearchFilter + OrderingFilter
File Handling       → Pillow for image processing
Environment Mgmt    → python-environ for .env configuration
```

#### Frontend Stack
```
Framework           → Next.js 16.2.4 with App Router
Language            → TypeScript 5
Styling             → Tailwind CSS v4 + Bootstrap 5.3.8
State Management    → React 19.2.4 hooks
HTTP Client         → Axios 1.15 with JWT interceptors
Charts              → Recharts 3.8.1
Export              → jsPDF 4.2.1, XLSX 0.18.5
Animations          → Framer Motion 12.38
Icons              → Lucide React 1.8.0
UI Components       → Custom components + Bootstrap
```

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                          NGINX                               │
│         (Reverse Proxy · Static Files · SSL/TLS)            │
├────────────────────┬────────────────────────────────────────┤
│   FRONTEND         │          BACKEND                        │
│  (Next.js:3000)    │   (Django:8000 / Gunicorn)             │
│                    │                                         │
│ • Pages (App)      │   API v1 Endpoints:                    │
│ • Components       │   /api/v1/auth/                        │
│ • Services         │   /api/v1/organizations/               │
│ • Hooks            │   /api/v1/farms/                       │
│                    │   /api/v1/livestock/                   │
│                    │   /api/v1/crops/                       │
│                    │   /api/v1/inventory/                   │
│                    │   /api/v1/finance/                     │
│                    │   /api/v1/reports/                     │
│                    │   /api/v1/tasks/                       │
│                    │   /api/v1/audit/                       │
│                    │   /api/v1/notifications/               │
├────────────────────┴────────────────────────────────────────┤
│                  BACKGROUND WORKERS                         │
│        (Celery Beat + Workers · Redis Backend)             │
├──────────────────────────────────────────────────────────────┤
│                    DATABASE LAYER                            │
│              PostgreSQL 16 (Primary)                         │
│              Redis 7 (Cache/Queue)                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Current Modules & Organization

### Backend Django Apps Structure (11 apps total)

#### 2.1 **accounts** - User Management & Authentication
**Models:**
- `User` - Custom user model with roles (OWNER, ADMIN, MANAGER, OPERATOR, VIEWER)
- Organization foreign key for multi-tenancy
- Avatar upload, phone, force_password_change flag

**Key Features:**
- JWT-based authentication (2-hour access token, 7-day refresh)
- Role-based access control (RBAC)
- User profile management
- Organization membership

**Endpoints:**
```
POST   /api/v1/auth/login/              - Token creation
POST   /api/v1/auth/token/refresh/      - Token refresh
POST   /api/v1/auth/register/           - User registration
POST   /api/v1/auth/password-recovery/  - Password reset
GET    /api/v1/auth/members/            - List org members
PATCH  /api/v1/auth/members/{id}/       - Update member
DELETE /api/v1/auth/members/{id}/       - Remove member
```

---

#### 2.2 **organizations** - Multi-Tenancy & Org Management
**Models:**
- `Organization` - Top-level tenant (plans: FREE, STARTER, PRO, ENTERPRISE)
- `OrganizationAddress` - Multiple addresses per org
- `OrganizationContact` - Multiple contacts (phone, email, whatsapp)

**Features:**
- Multi-tenant data isolation
- Organization planning/subscription tiers
- Logo management and branding

---

#### 2.3 **farms** - Farm/Property Management
**Models:**
- `Farm` - Physical farm property with geolocation (lat/lon), area in hectares
- `Sector` - Areas within a farm (pasture, paddock, greenhouse, field, building)

**Features:**
- Farm registration with CAR code (Cadastro Ambiental Rural)
- Sector type classification
- Geographic coordinates for mapping

---

#### 2.4 **livestock** - Comprehensive Livestock Management (MAJOR MODULE)
**Models (13 total):**

1. **Species** - Animal types (Bovino, Suíno, Aves, Ovino, etc.)
2. **Breed** - Breed classification per species
3. **AnimalBatch** - Lots/groups of animals
   - Batch code, quantity, entry/exit dates
   - Status: ACTIVE, SOLD, FINISHED, DEAD
   - Origin: PURCHASED, BORN, DONATED
   - Category: Bezerro, Garrote, Novilha, Touro, Matriz, Marrã, Vaca, Leitão, etc.
   - Phase: Creche, Crescimento, Engorda, Gestação/Maternidade, Reprodução
   - Average weight tracking
   - Source batches (merging/splitting)

4. **Animal** - Individual animal records
   - Identifier (earmark/tattoo/name)
   - Birth date, entry date
   - Gender (M/F)
   - Category & reproductive status
   - Weight (initial/current)
   - Pedigree: sire_ref/dam_ref (self-referential FK)
   - Birth count tracking
   - Parentage info (sire_name/dam_name if not in system)

5. **Mating** - Reproduction events
   - Type: NATURAL, AI (Inseminação Artificial), IATF
   - Status: PENDING_DG, CONFIRMED, FAILED
   - Female & sire tracking
   - Expected birth date calculation

6. **Pregnancy** - Confirmed pregnancies
   - Linked to Mating via OneToOne
   - Status: ONGOING, COMPLETED, LOST
   - Expected birth date

7. **Birth** - Birth records with detailed tracking
   - Live born, stillborn, mummified counts
   - Birth date & time (start/end)
   - Birth order (1st, 2nd parity)
   - Average birth weight
   - Auto-promotes category on first birth (Marrã→Matriz, Novilha→Vaca)
   - Increments birth_count on Animal
   - Sets reproductive_status to LACTANTE

8. **Litter** - Piglet litter records (before becoming batch)
   - Linked to Birth OneToOne
   - Weaning date & quantity
   - Average weaning weight

9. **Incubation** - Egg incubation for poultry
   - Start date, expected hatch date
   - Eggs incubated vs hatched
   - Status: INCUBATING, HATCHED, FAILED

10. **VaccinationRecord** - Vaccine application history
    - Animal or batch level
    - Vaccine name, dose type (1ª, 2ª, Reforço, etc.)
    - Application date & batch number
    - Applicator name
    - Next dose date

11. **WeightRecord** - Animal/batch weighing history
    - Weight in kg with decimals
    - Auto-updates current_weight_kg on Animal/AnimalBatch

12. **HealthRecord** - Clinical records (NEW!)
    - Treatment type: MEDICACAO, EXAME, CIRURGIA, OUTRO
    - Description, application date
    - Veterinary name
    - Cost tracking

13. **FeedingRecord** - Feed consumption/diet changes
    - Feed type, quantity in kg
    - Animal or batch level

**Key Features:**
- Reproductive tracking (mating→pregnancy→birth flow)
- Multi-species support with specific categories per species
- Phase management (creche/crescimento/engorda/reprodução)
- Health & clinical records
- Vaccination schedule management
- Weight tracking with historical records
- Feeding records by animal/batch
- Automatic status promotion on life events
- Pedigree tracking (sire/dam references)

**Endpoints (8 routers + 7 custom views):**
```
Router endpoints:
/api/v1/livestock/batches/                    - CRUD batches
/api/v1/livestock/batches/bulk_create_batches/ - Bulk creation
/api/v1/livestock/animals/                    - CRUD animals
/api/v1/livestock/matings/                    - CRUD matings
/api/v1/livestock/pregnancies/                - CRUD pregnancies
/api/v1/livestock/births/                     - CRUD births
/api/v1/livestock/litters/                    - CRUD litters
/api/v1/livestock/incubations/                - CRUD incubations
/api/v1/livestock/vaccinations/               - CRUD vaccinations
/api/v1/livestock/weights/                    - CRUD weight records

Custom views (with KPIs + phase-specific data):
/api/v1/livestock/marras/                     - Young females ready for mating
/api/v1/livestock/matrizes/                   - Breeding females (pregnant/lactating)
/api/v1/livestock/gestacoes/                  - Pregnant animals dashboard
/api/v1/livestock/maternidades/               - Nursing mothers dashboard
/api/v1/livestock/creches/                    - Nursery phase animals
/api/v1/livestock/crescimentos/               - Growth phase animals
/api/v1/livestock/engordas/                   - Fattening phase animals
/api/v1/livestock/dashboard/reproduction/     - Full reproduction dashboard
```

**Phase-Specific Views** (Custom APIViews with KPIs):
Each returns:
- KPIs (total count, status breakdown)
- Paginated animal rows with identifier, age, weight, status
- Alerts (colors, icons, timestamps)
- AI suggestions

---

#### 2.5 **crops** - Crop & Field Management
**Models:**
- `Field` - Agricultural field with area in hectares
- `PlantingCycle` - Crop cycle (planting→harvest)
  - Crop name, variety
  - Status: PLANNED, PLANTING, GROWING, HARVESTING, FINISHED
- `Harvest` - Harvest event with yield data

**Features:**
- Field-level crop planning
- Yield tracking (kg, per hectare)
- Quality grading
- Cycle status management

---

#### 2.6 **inventory** - Stock/Inventory Management
**Models (Complex 100-line structure):**
- `ItemEstoque` - Master item card supporting multiple categories:
  - **Categories:** Feed, Vaccine, Medicine, Fertilizer, Pesticide, Fuel, Equipment, Semen, etc.
  - **Technical fields (category-dependent):**
    - Medicines: princípio_ativo, concentração, via_aplicação, carência_dias, registro_mapa
    - Vaccines: temperatura_minima/maxima, doses_por_embalagem, volume_por_dose
    - Feed: composição, indicação_uso, modo_uso, peso_embalagem
    - Semen: tipo_semen (Convencional, Sexado M/F), especie_animal
  - Minimum stock alerts
  - Manufacturer info
  - Controlled medication flag

- `LoteEstoque` - Lot/batch for traceability
  - Expiration date
  - Cost per unit
  - Quantity
  - Lot number

- `MovimentacaoEstoque` - Every in/out/adjustment movement
  - Movement types: entry, exit, adjustment
  - Cost tracking
  - Storage location
  - Responsible party

**Features:**
- Multi-category inventory unified model
- Supplier management
- Minimum stock alerts
- Expiry tracking
- Cost control
- Movement audit trail

---

#### 2.7 **finance** - Financial Management
**Models:**
- `FinancialCategory` - Transaction categories (revenue/expense, hierarchical)
- `BankAccount` - Organization accounts (checking, savings, cash)
- `Transaction` - Financial transactions
  - Status: PENDING, PAID, OVERDUE, CANCELLED
  - Payment methods: PIX, BOLETO, CREDIT_CARD, TRANSFER, CASH
  - Due date & payment date tracking
  - Reference (NF, invoice number)
  - File attachments

**Features:**
- Cash flow management
- Account balance tracking
- Transaction categorization
- Payment status monitoring
- Receipt attachment support

---

#### 2.8 **reports** - Reporting & Analytics (ADVANCED)
**Models:**
- `ReportConfig` - Report template configuration
- `ReportSchedule` - Automatic report generation schedule
  - Frequency: DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY
  - Email delivery support
- `GeneratedReport` - Generated report instances
  - Status: PENDING, PROCESSING, COMPLETED, FAILED
  - Formats: PDF, EXCEL, CSV
  - Preview data storage
  - Execution time tracking
- `ReportWidget` - Dashboard widget configuration
  - Grid positioning (x, y, width, height)
  - Dynamic configuration

**Report Types:** 15+ including:
- Stock reports (general, movement, minimum, validity)
- Financial (cashflow, DRE, by category, comparative)
- Livestock (inventory, movement, mortality, weight)
- Crops (area, harvest)
- Farm summaries & KPIs
- Executive dashboard

---

#### 2.9 **tasks** - Task Management & Todos
**Models:**
- `Task` - Work items
  - Priority: LOW, MEDIUM, HIGH, CRITICAL
  - Status: OPEN, IN_PROGRESS, DONE, CANCELLED
  - Due date, assignments
  - Created by tracking

---

#### 2.10 **audit** - Immutable Audit Trail
**Models:**
- `AuditLog` - Immutable action logs
  - Actions: CREATE, UPDATE, DELETE, LOGIN, LOGOUT, EXPORT, OTHER
  - IP address & user agent tracking
  - JSON extra data storage
  - Never deleted (designed for archival)

---

#### 2.11 **notifications** - In-App & Alert System
**Models:**
- `Notification` - User notifications
  - Types: SYSTEM, STOCK, ANIMAL, FINANCE, REPORT
  - Priority: LOW, MEDIUM, HIGH, URGENT
  - Read status tracking
- `NotificationPreference` - User notification settings
  - Opt-in for alerts by type
  - Frequency: INSTANT, DAILY, WEEKLY
  - Email/push toggle
- `NotificationTemplate` - Notification message templates

---

### Frontend Structure (Next.js App Router)

#### Root Layout & Pages
```
/src/app/
├── layout.tsx                  - Root layout with auth wrapper
├── page.tsx                    - Redirect to /login or /home
└── /home/                      - Protected routes (requires auth)
```

#### Protected Routes (/home)
```
/home/
├── page.tsx                    - Main dashboard with KPIs, charts
├── layout.tsx                  - Main layout (sidebar, header, nav)
├── /rebanho/                   - Livestock module
│   ├── page.tsx               - Overview
│   ├── /marras/               - Young females
│   ├── /matrizes/             - Breeding females
│   ├── /gestacoes/            - Pregnant animals
│   ├── /reprodução/           - Reproduction dashboard
│   └── ...
├── /clinico/                   - Veterinary/Clinical module ✨
│   ├── page.tsx               - Dashboard with tabs
│   ├── /consultas/            - Veterinary consultations
│   ├── /vacinacao/            - Vaccination records
│   ├── /medicamentos/         - Medication records
│   └── /exames/               - Exam records
├── /estoque/                   - Inventory module
│   ├── page.tsx               - Stock overview
│   ├── /itens/                - Item management
│   ├── /movimentacoes/        - Movement history
│   ├── /fornecedores/         - Supplier management
│   └── /alertas/              - Stock alerts
├── /financeiro/               - Finance module
│   ├── page.tsx               - Dashboard
│   └── ...
├── /relatorios/               - Reports module
│   ├── page.tsx               - Report builder
│   └── ...
├── /profile/                  - User profile
├── /usuarios/                 - User management
└── /settings/                 - Organization settings
```

#### Component Structure
```
/src/components/
├── /ui/                       - Design system primitives (buttons, inputs, etc.)
├── /layout/                   - Sidebar, header, navbar
├── /feedback/                 - Toasts, modals, loading
├── /dashboard/                - Dashboard-specific components
├── /animal/                   - Animal-related components
├── /reproducao/               - Reproduction feature components
├── /auth/                     - Auth-related components
└── /notifications/            - Notification components
```

#### Services & Hooks
```
/src/services/
└── api.ts                     - Axios client with JWT interceptors

/src/hooks/
├── useAuth.ts                - Authentication state
├── useQuery.ts               - API data fetching
├── useLocalStorage.ts        - Persistent storage
└── ...

/src/types/
└── index.ts                  - Global TypeScript interfaces

/src/validators/
└── schemas.ts                - Zod validation schemas
```

---

## 3. Database Schema & Data Models

### Key Relationships

#### Multi-Tenancy
```
Organization (1) ──→ (Many) Farm
         ├─→ User (members)
         ├─→ FinancialCategory
         ├─→ Task
         ├─→ ReportConfig
         └─→ InventoryItem
```

#### Livestock Domain
```
Farm (1) ──→ (Many) AnimalBatch
                   ├─→ Mating → Pregnancy → Birth → Litter
                   └─→ Animal
                       ├─→ VaccinationRecord
                       ├─→ WeightRecord
                       ├─→ HealthRecord
                       ├─→ FeedingRecord
                       └─→ Matings (as female/sire)

Animal (1) ──→ (Many) Animal (pedigree via sire_ref/dam_ref)
```

#### Crops Domain
```
Farm (1) ──→ (Many) Field
                    └─→ PlantingCycle
                        └─→ Harvest
```

#### Finance Domain
```
Organization (1) ──→ (Many) Transaction
                ├─→ FinancialCategory
                ├─→ BankAccount
                └─→ User (created_by)
```

### Field Types & Constraints

#### Base Model (All models inherit)
- `id` - UUID primary key
- `created_at` - Auto timestamp
- `updated_at` - Auto timestamp

#### Unique Constraints
- User.email (global)
- Farm.name (per organization)
- AnimalBatch.batch_code (per farm)
- Animal.identifier (per farm)
- Organization.slug (global)

#### Indexing
- User.email, created_at
- Organization.name
- NotificationLog user + is_read
- Audit log created_at
- Report created_at, status

---

## 4. API Endpoints & Services Structure

### Authentication Endpoints
```
POST   /api/v1/auth/login/
POST   /api/v1/auth/token/refresh/
POST   /api/v1/auth/register/
POST   /api/v1/auth/password-recovery/
```

### RESTful Resource Endpoints (Standard Pattern)
Each app follows:
```
GET    /api/v1/{resource}/              - List (paginated, filterable)
POST   /api/v1/{resource}/              - Create
GET    /api/v1/{resource}/{id}/         - Detail
PATCH  /api/v1/{resource}/{id}/         - Partial update
DELETE /api/v1/{resource}/{id}/         - Delete
```

### Pagination & Filtering
- **Default page size:** 20 items
- **Max page size:** 100 items
- **Filters:** DjangoFilterBackend + SearchFilter + OrderingFilter
- **Response format:** StandardResultsPagination with count, next, previous, total_pages

### API Documentation
- **Swagger UI:** `/api/schema/swagger/`
- **ReDoc:** `/api/schema/redoc/`
- **OpenAPI Schema:** `/api/schema/`

### Error Handling
- **Custom exception handler:** `/common/exceptions.py`
- **Error format:**
```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request",
    "detail": {"field": ["error message"]}
  }
}
```

---

## 5. Frontend Components Organization

### Design System (UI Components)
- Buttons (primary, secondary, danger variants)
- Forms (inputs, selects, textareas, file uploads)
- Cards & containers
- Tables with sorting/filtering
- Modal dialogs
- Toast notifications
- Loading spinners
- Badges & tags

### Feature-Specific Components
- **Livestock:** AnimalBatchForm, MatingsTable, PregnancyTimeline, BirthRecordForm
- **Clinical:** ConsultationForm, VaccinationSchedule, HealthRecordsList
- **Inventory:** ItemForm, MovementLog, StockAlerts, SupplierList
- **Finance:** TransactionForm, CashflowChart, CategoryBreakdown
- **Reports:** ReportBuilder, DateRangeSelector, ExportOptions

### Hooks
- `useAuth()` - User, organization, token management
- `useFetch()` - Generic API data fetching with loading/error
- `useForm()` - Form state management
- `useLocalStorage()` - Client-side persistence
- `useNotification()` - Toast notifications

### Services
- **apiClient** - Axios instance with:
  - JWT token injection
  - Automatic token refresh
  - Request/response logging (dev mode)
  - Error normalization
  - FormData handling (file uploads)

---

## 6. Authentication & Permissions System

### Authentication Flow
1. **Login:** POST `/auth/login/` with email + password → returns access + refresh tokens
2. **Token Storage:** LocalStorage (access_token, refresh_token)
3. **Request Injection:** Authorization header with Bearer token
4. **Token Refresh:** Automatic via interceptor on 401 response
5. **Logout:** Clear localStorage, redirect to /login

### Authorization (RBAC)
**User Roles:**
- `OWNER` - Full system access, organization management
- `ADMIN` - Farm & user management, reports
- `MANAGER` - Operational management, task assignment
- `OPERATOR` - Data entry & basic operations
- `VIEWER` - Read-only access

**Permissions:**
- `IsAuthenticated` - Required for all /api/v1/ endpoints except auth
- `IsOrganizationMember` - User must belong to organization
- `IsOrganizationAdmin` - User role in (ADMIN, OWNER)

### Multi-Tenancy
- All models linked to Organization via FK
- Queries automatically scoped to user.organization
- Organization isolation at database level (no cross-org data access)

---

## 7. Existing Clinical/Veterinary Module Functionality

### Current Implementation Status: ✨ PARTIALLY IMPLEMENTED

#### Backend Models (COMPLETE)
1. **HealthRecord** - Core clinical tracking
   - Treatment type: MEDICACAO, EXAME, CIRURGIA, OUTRO
   - Description, dates, veterinary name
   - Cost tracking
   - Notes

2. **VaccinationRecord** - Vaccine application
   - Vaccine name & batch number
   - Application date, dose type (1ª, 2ª, Reforço)
   - Next dose date scheduling
   - Dosage in ml

3. **WeightRecord** - Weight tracking (health indicator)
   - By animal or batch
   - Automatic updates to current_weight_kg
   - Historical tracking

4. **FeedingRecord** - Nutritional management
   - Feed type, quantity
   - Date tracking

#### Frontend Implementation (SKELETON)
**Location:** `/src/app/home/clinico/`

**Implemented:**
- Tab navigation (Consultas, Vacinação, Medicamentos, Exames)
- KPI cards (0 values - static)
- Placeholder content sections

**NOT Yet Implemented:**
- Data fetching from backend
- Form components for creating records
- Table views with data
- Filtering/search
- Edit/delete operations
- Report generation

#### Missing Features to Build
1. **Data Integration** - Connect frontend to backend APIs
2. **Consultation Management** - CRUD for HealthRecords with treatment_type
3. **Vaccination Schedule** - Calendar view, reminders, protocol management
4. **Exam Management** - Exam request/result tracking
5. **Clinical Dashboard** - Health status overview, alerts
6. **Medication Tracking** - Drug usage, frequency, side effects
7. **Diagnostic Notes** - Rich text entry for clinical observations
8. **Report Generation** - Health history exports

---

## 8. Integration Patterns Between Modules

### Data Flow Examples

#### Example 1: Animal Birth → Livestock + Reproduction
```
1. Create Pregnancy (linked to Mating)
2. Record Birth (references Pregnancy)
3. Birth.save() triggers:
   - Auto-increment female.birth_count
   - Promote female category (Marrã→Matriz)
   - Set reproductive_status = LACTANTE
   - Create Litter (optional)
4. Update Animal batch assignments
```

#### Example 2: Vaccination Campaign
```
1. Create VaccinationRecord (animal or batch level)
2. Set next_dose_date
3. Generate Task for farm manager
4. Send Notification to responsible user
5. Log in AuditLog for compliance
6. Update InventoryItem (vaccine stock)
7. Add to financial expense category
```

#### Example 3: Stock Alert → Notification → Task
```
1. InventoryItem stock falls below estoque_minimo
2. System generates Notification (STOCK type)
3. Creates Task assigned to farm manager
4. Sends email if notification_preference.email_notifications = True
5. Logs action in AuditLog
```

#### Example 4: Report Generation
```
1. ReportSchedule triggers (via Celery Beat)
2. GeneratedReport created in PROCESSING status
3. Backend gathers data (livestock counts, finance, inventory)
4. Generates PDF/EXCEL via task worker
5. Updates GeneratedReport with file + status=COMPLETED
6. Sends email to recipients if configured
7. Creates Notification for report availability
```

### Organization/Farm Context Flow
```
User.organization → scopes all queries
Every create operation: org = request.user.organization
Farm filtering: Farm.objects.filter(organization=user.organization)
```

---

## 9. Additional Key Features

### Async Tasks (Celery)
- Report generation
- Email notifications
- Batch data processing
- Scheduled tasks via Celery Beat

### File Management
- Image uploads (avatars, attachments)
- Report exports (PDF, XLSX, CSV)
- Receipt/invoice uploads
- Media serving via media/ directory

### Logging & Monitoring
- Django logging to console
- Audit trail for sensitive operations
- User action tracking
- IP & user agent logging

### Development Tools
- Django shell_plus (with django-extensions)
- Direct database shell access
- Custom management commands (see /scripts/)
- Pytest for testing with coverage
- Multiple settings environments (dev/prod/test)

---

## 10. Key Statistics

| Metric | Value |
|--------|-------|
| Django Apps | 11 |
| Data Models | 50+ |
| Database Migrations | 86 |
| API Endpoints | 100+ |
| Frontend Routes | 15+ |
| User Roles | 5 |
| Livestock Models | 13 |
| Report Types | 15+ |
| Notification Types | 5 |
| Role Permissions | 2+ groups |

---

## 11. Technology Versions

### Backend
- Python 3.12
- Django 5.0
- DRF 3.15
- PostgreSQL 16
- Redis 7
- Celery 5.3

### Frontend
- Node.js 20+
- Next.js 16.2.4
- React 19.2.4
- TypeScript 5
- Tailwind CSS 4
- Bootstrap 5.3.8

---

## 12. Deployment Structure

### Local Development
```bash
make dev           # Starts Django :8000 + Next.js :3000
make debug         # With debugpy + Node inspector
make test          # Run pytest suite with coverage
```

### Docker Development
```bash
make docker-dev    # Hot reload with docker-compose.dev.yml
```

### Production
```bash
make docker-prod   # Multi-stage builds, Gunicorn, Nginx
```

### Database Management
```bash
make migrations    # Create migration files
make migrate       # Apply migrations
make reset-db      # Destroy and recreate
make seed          # Load demo data
```

---

## 13. Testing & Quality

### Backend Testing
- Framework: pytest with pytest-django
- Coverage tracking
- Test utilities in `/tests/` directory

### Code Quality
- Linting: Ruff (Python), ESLint (TypeScript)
- Type checking: mypy (Python), tsc (TypeScript)
- Formatting: Ruff format, Prettier

### Git Workflow
- Conventional commits with Makefile shortcuts
- Pre-commit hooks (via scripts)
- Commit types: feat, fix, hotfix, docs, style, refactor, test, etc.

---

## 14. Conclusion & Next Steps

### Current State
AgroManage is a **robust, feature-complete agricultural platform** with:
- ✅ Multi-tenant architecture ready
- ✅ Comprehensive livestock management
- ✅ Full RBAC system
- ✅ Financial tracking
- ✅ Advanced reporting
- ✅ Audit trail
- ⏳ Clinical module (skeleton UI + complete backend models)

### Recommended Development Focus
1. **Clinical Module Integration** - Connect frontend forms to backend APIs
2. **Phase Dashboard Completion** - Full CRUD operations on livestock phases
3. **Mobile Responsiveness** - Optimize for field use on tablets
4. **Real-time Updates** - WebSocket integration for live data
5. **Offline Support** - Progressive Web App features
6. **Advanced Analytics** - Predictive models for health/productivity

---

**Generated:** 2026-05-22
**Version:** AgroManage 1.0.0
**License:** MIT
