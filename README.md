# NIRF Ranking Calculator

Full-stack web application for computing NIRF (National Institutional Ranking Framework) scores and predicting rankings for Indian educational institutions. Supports the Engineering category with data from the NIRF 2025 framework.

## Features

- **PDF Upload & Auto-Extract**: Upload NIRF credentials PDFs and auto-extract 30+ metrics
- **NIRF Score Computation**: Calculate scores across 5 parameters (TLR, RP, GO, OI, PR) with sub-parameter breakdowns
- **Rank Prediction**: ML-based rank prediction using trained model on top-90 engineering institutions
- **Dashboard**: Radar charts, bar charts, parameter drill-down, score and prediction history
- **Authentication**: JWT-based auth with institution registration

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts
- **Backend**: Express.js, TypeScript, PostgreSQL, pdfjs-dist
- **ML**: Custom stochastic hill-climbing rank prediction model

## Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- npm

## Database Setup

```bash
# Create PostgreSQL role and database
createuser -P nirf_app   # password: nirf_app_pw123
createdb -O nirf_app nirf_db
```

## Run Migrations

```bash
cd server
npm run migrate
```

This creates tables: `users`, `institutions`, `raw_metrics`, `scores`, `score_breakdown`, `rank_model`, `nirf_instances`, `predictions`.

## Train the Rank Prediction Model

```bash
cd server
npx ts-node src/scripts/trainModel.ts
```

This reads `nirf_dataset.json` (90 institutions with extracted metrics), optimizes feature weights via stochastic hill-climbing, and saves the model to PostgreSQL.

## Running the Application

```bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend on `http://localhost:4000`.

## Testing

```bash
cd server
npm test            # run all tests
npm run test:watch  # watch mode
npm run typecheck   # type-check without emitting
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Register institution |
| POST | /api/auth/login | Yes | Login |
| GET | /api/auth/me | Yes | Current user |
| POST | /api/upload | Yes | Upload PDF, extract metrics |
| POST | /api/metrics | Yes | Save metrics, compute NIRF score |
| GET | /api/scores | Yes | List scores |
| GET | /api/scores/:id/breakdown | Yes | Score breakdown |
| PUT | /api/category | Yes | Set NIRF category |
| POST | /api/predict | Yes | Upload PDF, predict rank |
| GET | /api/predictions | Yes | List predictions |

## NIRF Parameters

| Parameter | Weight | Sub-metrics |
|-----------|--------|-------------|
| TLR (Teaching, Learning & Resources) | 30% | Student Strength, Faculty-Student Ratio, Faculty with PhD, Financial Resources |
| RP (Research & Professional Practice) | 30% | Publications, Quality of Publications, IPR/Patents, Projects & Practice |
| GO (Graduation Outcomes) | 20% | Placement & Higher Studies, Examinations, Median Salary, PhD Graduates |
| OI (Outreach & Inclusivity) | 10% | Region Diversity, Women Diversity, ESCS, Physically Challenged |
| PR (Perception) | 10% | Peer & Employer Survey |

## Project Structure

```
NIRF_ranking/
├── client/                 # React frontend
│   └── src/
│       ├── pages/          # Login, Register, Dashboard, Upload
│       ├── context/        # Auth context
│       ├── services/       # API client
│       └── types/          # TypeScript types, metric definitions
├── server/                 # Express backend
│   └── src/
│       ├── controllers/    # Route handlers
│       ├── db/             # PostgreSQL connection
│       ├── middlewares/    # Auth, file upload
│       ├── migrations/     # SQL schema
│       ├── routes/         # Express routes
│       ├── scripts/        # PDF download, dataset scan, model training
│       ├── services/       # Core logic
│       │   ├── nirf/       # Scoring engine, caps, types
│       │   ├── nirfExtractor.ts  # PDF metric extraction
│       │   ├── rankModel.ts      # ML prediction model
│       │   └── predictService.ts # Prediction service
│       └── types/          # TypeScript types
├── nirf_2025_engineering_top90.csv  # Ground truth rankings
└── README.md
```
