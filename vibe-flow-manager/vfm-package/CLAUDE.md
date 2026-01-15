# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## VFM (Vibe Flow Manager) Project

This project is managed by VFM - an AI-integrated development workflow system.

## Workflow Stages

This project follows a 5-stage development workflow:

1. **Draft (초안)**: Requirements analysis, technology research, codebase exploration
2. **Plan (플랜)**: Detailed implementation planning, architecture design
3. **Progress (진행)**: Actual code implementation with file creation/modification
4. **Verify (검증)**: Code review, testing, quality validation
5. **Complete (완료)**: Documentation, final cleanup, summary

## Stage-Specific Agents

Each stage has a dedicated agent in `.claude/agents/`:
- `vfm-draft.md` - Research and analysis agent
- `vfm-plan.md` - Planning and architecture agent
- `vfm-progress.md` - Implementation agent (Agentic Mode)
- `vfm-verify.md` - Testing and review agent
- `vfm-complete.md` - Documentation agent

## Project Data

Project state and logs are stored in `.vfm/`:
- `config.json` - VFM configuration
- `project.json` - Task states and workflow progress
- `logs/` - Execution logs per stage
