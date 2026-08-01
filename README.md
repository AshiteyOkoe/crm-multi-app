# BranchCRM — Multi-Branch CRM & Operations Suite

A production-ready **Customer Relationship Management & Operations** web application for retail/service businesses running **3 physical shop branches**, with a centralized remote dashboard for the business owner.

**Frontend:** Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Recharts · jsPDF
**Backend:** Node.js · Express.js · TypeScript · Prisma ORM
**Database:** PostgreSQL
**Auth:** JWT · bcrypt · role-based access control (Admin / Branch Manager / Sales Staff)

---

## ✨ Features

### Multi-branch dashboard (owner)
- Live KPIs: today's revenue, transaction count, monthly revenue, top-performing branch
- **Side-by-side branch comparison** (Branch 1 / 2 / 3)
- Low-stock & out-of-stock alerts
- Real-time activity feed of recent sales, returns and changes

### CRM
- Unified customer profiles (name, contact, company, preferred branch, purchase history, **lifetime value**, notes, birthday/anniversary)
- Fast search by name / phone / email across all branches (duplicate detection)
- **Loyalty**: purchase tracking, birthday/anniversary fields, segment tagging (VIP / Regular / Inactive / New)

### Sales & transactions
- Fast POS-style sale logging with **Cash / Card / Mobile Money**
- Digital receipt (on-screen + print)
- **Returns & refunds** with mandatory manager approval and automatic stock restore
- Sales history with filters (branch, date range, status)

### Multi-location inventory
- Stock tracked **per branch**
- **Stock transfer system**: request → approve → receive, with status tracking
- Automated low-stock / out-of-stock alerts to the owner

### Leads & pipeline
- Lead creation, source tracking, assignment to sales reps
- **Visual kanban pipeline**: New → Contacted → Qualified → Proposal Sent → Negotiation → Won / Lost
- Convert won leads into customers in one click
- Follow-ups (calls, meetings, reminders), tasks with priorities and due dates

### Analytics & reports
- Financial reports (revenue, profit, margin) for day / week / month / year
- Lead conversion, best-selling products, staff performance, customer growth
- **Export to CSV and PDF**

### Platform
- Secure login (bcrypt + JWT), role-based access per branch
- In-app notifications, audit logs
- Responsive, mobile-first UI

---

## 📦 Project structure

```
crm-app/
├── client/                  # Next.js frontend
│   ├── app/
│   │   ├── (auth)/login, (auth)/register
│   │   └── (app)/dashboard, customers, leads, sales, inventory, tasks, reports, settings
│   ├── components/          # ui/, charts/, sales/, customers/, leads/, Sidebar, Header
│   ├── context/             # auth + app state (AppContext)
│   ├── lib/                 # api client, utils, hooks
│   └── types/
├── server/                  # Express REST API
│   ├── prisma/
│   │   ├── schema.prisma    # full database schema
│   │   └── seed.ts          # demo data (3 branches, users, products, sales)
│   └── src/
│       ├── controllers/
│       ├── middleware/      # JWT auth, role guards, error handling, validation
│       ├── routes/
│       └── utils/
├── docker-compose.yml       # optional local PostgreSQL
└── .env.example
```

---

## 🚀 Getting started (local)

### Prerequisites
- Node.js 18+ (Node 20/22 recommended)
- PostgreSQL 14+ running locally — or use Docker, Supabase, or Railway

### 1. Database

**Option A — Docker (easiest):**
```bash
docker compose up -d
# creates crm_app database at localhost:5432 (postgres/postgres)
```

**Option B — Local/Supabase:** create a database and use its connection string.

### 2. Configure the server

```bash
cd server
cp .env.example .env     # then edit DATABASE_URL, JWT_SECRET, CLIENT_URL
```

Then install, create the schema and seed demo data:

```bash
npm install
npm run db:setup         # prisma db push + prisma db seed
```

### 3. Run the API

```bash
npm run dev              # http://localhost:5000/api
```

Health check: `GET http://localhost:5000/api/health`

### 4. Run the frontend

```bash
cd ../client
cp .env.local.example .env.local   # or create .env.local with NEXT_PUBLIC_API_URL
npm install
npm run dev              # http://localhost:3000
```

---

## 🔑 Demo accounts

All seeded passwords are `password123`.

| Role            | Email            | Access                                   |
| --------------- | ---------------- | ---------------------------------------- |
| Owner (Admin)   | owner@crm.app    | All 3 branches, global reports, settings |
| Branch Manager  | manager1@crm.app | Branch 1 only                            |
| Branch Manager  | manager2@crm.app | Branch 2 only                            |
| Sales Staff     | cashier1@crm.app | Branch 1 transactions & customers        |
| Sales Staff     | cashier2@crm.app | Branch 3 transactions & customers        |

---

## 🔌 API overview

| Method | Route                                    | Description                          |
| ------ | ---------------------------------------- | ------------------------------------ |
| POST   | `/api/auth/register`                     | Register (staff) or admin-created    |
| POST   | `/api/auth/login`                        | Login → JWT                          |
| GET    | `/api/auth/me`                           | Current user                         |
| GET    | `/api/branches`                          | List branches                        |
| GET    | `/api/branches/users`                    | List team members                    |
| POST   | `/api/branches/users`                    | Create user (admin)                  |
| GET    | `/api/branches/returns`                  | List returns                         |
| POST   | `/api/branches/returns/:id/decide`       | Approve/reject return                |
| GET    | `/api/branches/notifications`            | My notifications                     |
| GET    | `/api/branches/audit-logs`               | Audit log (admin)                    |
| CRUD   | `/api/customers`                         | Customers + search + pagination      |
| POST   | `/api/customers/:id/interactions`        | Log interaction                      |
| CRUD   | `/api/leads`                             | Leads (dedupe by phone/email)        |
| POST   | `/api/leads/:id/convert`                 | Convert won lead → customer          |
| GET    | `/api/leads/opportunities`               | Pipeline opportunities               |
| POST   | `/api/sales`                             | Create sale (POS, stock-aware)       |
| GET    | `/api/sales`                             | Sales history + filters              |
| POST   | `/api/sales/returns`                     | Request a return                     |
| GET    | `/api/inventory`                         | Per-branch stock + low-stock alerts  |
| POST   | `/api/inventory/transfers`               | Request stock transfer               |
| POST   | `/api/inventory/transfers/:id/decide`    | Approve / reject / receive           |
| CRUD   | `/api/tasks`                             | Tasks                                |
| CRUD   | `/api/tasks/follow-ups`                  | Follow-ups                           |
| GET    | `/api/reports/dashboard`                 | Owner dashboard (aggregate/comparison) |
| GET    | `/api/reports/sales\|leads\|customers`   | Period reports                       |
| GET    | `/api/reports/export/:type`              | CSV export                           |

All business routes require `Authorization: Bearer <jwt>`. Managers/staff are automatically restricted to their assigned branch server-side.

---

## 🛡️ Security model

- Passwords hashed with **bcrypt** (salt rounds configurable)
- Short-lived **JWT** access tokens (expiry configurable)
- **Role middleware** (`authorize(...roles)`) for admin/manager endpoints
- **Branch scoping** — non-admin users can only read/write data for their assigned branch (enforced in every controller, not just the UI)
- Zod validation on all inputs; centralized error handling; full **audit logging** of sensitive actions

---

## ☁️ Deployment

### Backend → Render / Railway
1. Push the repo; create a **PostgreSQL** database (Railway/Render/Supabase).
2. Set env vars: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`.
3. Build command: `cd server && npm install && npm run build`
4. Start command: `cd server && npm run start`
5. Run migrations: `cd server && npx prisma db push` (or `prisma migrate deploy`).

### Frontend → Vercel
1. Import the repo, set **Root Directory** to `client`.
2. Set `NEXT_PUBLIC_API_URL` to your deployed API URL.
3. Deploy. Build command `npm run build`, output `.next`.

---

## 🧪 Useful commands

```bash
# Server
cd server
npm run typecheck      # type safety
npm run build          # compile to dist/
npm run db:setup       # push schema + seed demo data
npm run prisma:studio  # inspect the database visually

# Client
cd client
npm run typecheck
npm run build
```

---

## 🗺️ Roadmap / next enhancements

- PWA + offline POS
- Email/SMS receipt delivery and WhatsApp integration
- Google Calendar sync, predictive sales analytics, AI lead scoring
- Multi-tenant (SaaS) support, CI/CD with GitHub Actions, unit/integration tests
