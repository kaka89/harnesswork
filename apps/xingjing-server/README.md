# Xingjing Server

A Bun + SQLite backend service for the enterprise AI engineering efficiency platform.

## Quick Start

### Prerequisites
- Bun runtime (v1.0.0+)
- Node.js 18+ (for TypeScript support)

### Installation

```bash
bun install
```

### Development

```bash
bun run dev
```

The server will start on `http://localhost:4100` (configurable via `XINGJING_PORT` env var).

### Production Build

```bash
bun run build
bun start
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Products
- `GET /api/products` - List all products
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### PRDs (Product Requirements Documents)
- `GET /api/prds?productId=...` - List PRDs (optional filter)
- `POST /api/prds` - Create PRD
- `PUT /api/prds/:id` - Update PRD
- `DELETE /api/prds/:id` - Delete PRD

### Tasks
- `GET /api/tasks?productId=...` - List tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Backlog
- `GET /api/backlog?productId=...` - List backlog items
- `POST /api/backlog` - Create backlog item

### Sprints
- `GET /api/sprints?productId=...` - List sprints
- `POST /api/sprints` - Create sprint

### Knowledge Documents
- `GET /api/knowledge?category=...` - List knowledge docs
- `POST /api/knowledge` - Create knowledge doc

### DORA Metrics
- `GET /api/metrics?period=...` - Get DORA metrics

### AI Sessions
- `GET /api/ai-sessions?productId=...` - List AI sessions
- `POST /api/ai-sessions` - Create AI session
- `GET /api/ai-sessions/:id` - Get AI session by ID

## Database

SQLite database stored in `xingjing.db` (or `$XINGJING_DB` if specified).

Tables:
- `products` - Project/product data
- `prds` - Product requirements documents
- `tasks` - Development tasks
- `backlog_items` - Backlog items
- `sprints` - Sprint data
- `sprint_tasks` - Sprint-task associations
- `knowledge_docs` - Knowledge base documents
- `ai_sessions` - AI assistant sessions
- `dora_metrics` - Engineering metrics

## Configuration

Environment variables:
- `XINGJING_PORT` - Server port (default: 4100)
- `XINGJING_DB` - Database path (default: xingjing.db)

## Development

### Type Checking

```bash
bun run typecheck
```

### Project Structure

```
src/
├── index.ts      - Main server and route handlers
├── db.ts         - Database initialization and queries
├── types.ts      - TypeScript type definitions
└── seed.ts       - Database seed data
```

## CORS

Allowed origins:
- http://localhost:3001
- http://localhost:5173
