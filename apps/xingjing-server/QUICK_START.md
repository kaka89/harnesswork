# Quick Start Guide

## Prerequisites
- Bun runtime installed (https://bun.sh)
- Node.js 18+ for TypeScript support

## Installation & Running

### 1. Install Dependencies
```bash
cd /path/to/xingjing-server
bun install
```

### 2. Start Development Server
```bash
bun run dev
```

The server will start on `http://localhost:4100` with hot reload enabled.

### 3. Test the Server
```bash
# Health check
curl http://localhost:4100/health

# Get all products
curl http://localhost:4100/api/products

# Create a product
curl -X POST http://localhost:4100/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","description":"Test project"}'

# Get all PRDs
curl http://localhost:4100/api/prds

# Get all tasks
curl http://localhost:4100/api/tasks

# Get all sprints
curl http://localhost:4100/api/sprints

# Get knowledge documents
curl http://localhost:4100/api/knowledge

# Get DORA metrics
curl http://localhost:4100/api/metrics
```

## Environment Variables

```bash
# Optional: Custom port (default: 4100)
export XINGJING_PORT=4100

# Optional: Custom database path (default: xingjing.db)
export XINGJING_DB=./xingjing.db

# Then run
bun run dev
```

## Production Build

```bash
# Build
bun run build

# Run production
bun start
```

## Database

- **Location:** `xingjing.db` (in working directory)
- **Auto-initialized:** Tables created on first run
- **Auto-seeded:** Initial data populated on first run
- **Reset:** Delete `xingjing.db` to start fresh

## Available Scripts

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start dev server with hot reload |
| `bun run start` | Run production server |
| `bun run build` | Build for production |
| `bun run typecheck` | Check TypeScript types |

## Key Implementation Notes

1. **No Framework Used** - Pure Bun.serve() HTTP handling
2. **Manual Routing** - URL pattern matching in handleRequest
3. **SQLite Database** - File-based, embedded
4. **Type Safe** - Full TypeScript with strict mode
5. **Auto-seeding** - Sample data loaded on first run
6. **CORS Enabled** - Configured for localhost:3001 and 5173

## Common Tasks

### Add a New Product
```bash
curl -X POST http://localhost:4100/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Project",
    "description": "Description",
    "type": "enterprise",
    "mode": "team",
    "techStack": "Java/Kafka"
  }'
```

### Update a Product
```bash
curl -X PUT http://localhost:4100/api/products/PROJ-001 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'
```

### Create a Task
```bash
curl -X POST http://localhost:4100/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Task",
    "sddId": "SDD-001",
    "assignee": "Developer Name",
    "status": "todo",
    "priority": "P0",
    "estimate": 1.5,
    "dod": [
      {"label": "Implementation", "done": false},
      {"label": "Testing", "done": false}
    ]
  }'
```

### Create an AI Session
```bash
curl -X POST http://localhost:4100/api/ai-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Analyze performance metrics",
    "productId": "PROJ-001"
  }'
```

## Troubleshooting

### Port already in use
```bash
# Use different port
export XINGJING_PORT=4101
bun run dev
```

### Database locked
```bash
# Delete and recreate
rm xingjing.db
bun run dev
```

### Type errors
```bash
# Check types
bun run typecheck

# View errors and fix
```

## File Locations

- **Source code:** `src/`
  - `index.ts` - Main server and routes
  - `db.ts` - Database layer
  - `types.ts` - Type definitions
  - `seed.ts` - Initial data
- **Config files:** Root directory
  - `package.json` - Dependencies
  - `tsconfig.json` - TypeScript config
- **Database:** `xingjing.db` (created at runtime)

## Next Steps

1. Start the server: `bun run dev`
2. Open http://localhost:4100/health in browser
3. Connect frontend to backend at http://localhost:4100
4. Start building!
