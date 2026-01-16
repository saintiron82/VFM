# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vibe Flow Manager (VFM) is an Electron + React application for managing "vibe coding" workflows. It integrates with Claude Code CLI to automate software development tasks through a Kanban-style interface with 5 stages: 초안 (Draft), 플랜 (Plan), 진행 (Progress), 검증 (Verify), 완료 (Complete).

## Development Commands

```bash
# Install dependencies
cd vibe-flow-manager && npm install

# Start development (Vite + Electron concurrently)
npm start

# Run Vite dev server only
npm run dev

# Run Electron only (requires Vite server running on port 5173)
npm run electron

# Build for production
npm run build
```

## Architecture

### Directory Structure
- `vibe-flow-manager/` - Main application code
  - `electron/` - Electron main process (main.js, preload.js)
  - `src/` - React frontend (JSX, Zustand store)
  - `data/projects/` - Project JSON storage
- `.claude/agents/` - Custom Claude Code agent definitions (YAML frontmatter + markdown)

### Key Components

**Electron Main Process** (`electron/main.js`):
- IPC handlers for Claude Code CLI execution via stdin (`claude --print -`)
- Project CRUD operations (JSON files in `data/projects/`)
- Folder selection dialogs
- Claude Code installation detection (checks for CLAUDE.md existence)
- Agent management (copies `.md` files from resources to `.claude/agents/`)

**Preload Bridge** (`electron/preload.js`):
- Exposes `window.electronAPI` with all IPC methods to renderer

**State Management** (`src/store/projectStore.js`):
- Zustand store for projects, components, and workflow stages
- Components have 5-stage workflow: 초안 → 플랜 → 진행 → 검증 → 완료
- Supports component decomposition (parent/child relationships)

**Main UI Flow**:
1. `App.jsx` - Project selection and main layout
2. `ProjectInput.jsx` - New project creation with AI decomposition
3. `KanbanBoard.jsx` - Drag-and-drop stage management
4. `CardDetail.jsx` - Component execution with Claude Code

### Claude Code Integration

The app executes Claude Code CLI with prompts via stdin:
```javascript
spawn('claude', ['--print', '-'], { cwd: workingDir })
proc.stdin.write(prompt)
```

Responses are saved to `.vibe-flow/{stage}/{componentName}_{timestamp}.md` in the project directory.

### Data Model

**Project**:
```javascript
{
  id: string,
  goal: string,
  workingDir: string,
  components: Component[],
  status: 'decomposing' | 'active'
}
```

**Component**:
```javascript
{
  id: string,
  name: string,
  description: string,
  currentStage: string,
  stages: { [stageName]: { status, logs } },
  parentId?: string,
  childIds?: string[]
}
```

## Korean UI

The application uses Korean for UI labels and workflow stages. Stage names:
- 초안 (Draft) - Research and notes
- 플랜 (Plan) - Implementation planning
- 진행 (Progress) - Active development
- 검증 (Verify) - Testing and validation
- 완료 (Complete) - Done

## Custom Agents

Agent files in `.claude/agents/` use YAML frontmatter:
```yaml
---
name: agent-name
description: "Description for Claude Code"
model: opus
color: red
---
```
