@AGENTS.md

## gstack

gstack is an open-source software factory for Claude Code. It provides specialized agents and skills for planning, design, code review, QA, security audits, and releases.

**Core skills (use liberally):**
- `/office-hours` — Product interrogation and scope clarity
- `/plan-ceo-review` — Strategic product review before building
- `/plan-eng-review` — Architecture and engineering review
- `/plan-design-review` — Design system and UX review
- `/autoplan` — End-to-end feature planning
- `/review` — Code review on any branch
- `/ship` — Prepare PR and ensure CI passes
- `/land-and-deploy` — Merge and deploy with confidence

**Specialized agents:**
- `/qa` — QA test against staging or local URL
- `/design-review` — Design critique and suggestions
- `/cso` — Security audit (OWASP + STRIDE)
- `/retro` — Weekly engineering retrospective
- `/investigate` — Root cause debugging
- `/browse` — Web browsing (use this, never use mcp__claude-in-chrome__ tools)
- `/document-release` — Generate release notes

For full list: `/gstack-upgrade --list`
