# Snappeal

> Appeal a London parking ticket in under five taps.

This repository hosts the **Snappeal** project — a London PCN appeal app at `snappeal.ai`. The current phase is the **documentation wiki**, which holds the business plan, product spec, architecture, and council knowledge base.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running on your machine.

## Running the wiki

```bash
docker compose up wiki
```

Then open <http://localhost:8000>.

Edit any markdown file under `wiki/docs/` and the browser will live-reload within a couple of seconds.

To stop:

```bash
docker compose down
```

## Project layout

```
parkingappeal/
├── docker-compose.yml      # orchestrates wiki (and later: admin, db, proxy)
├── wiki/                   # MkDocs Material documentation site
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── mkdocs.yml
│   └── docs/               # all the content
└── README.md
```

## Roadmap

- **Phase A** (now) — public wiki: business plan, product spec, architecture, council KB, legal guides.
- **Phase B** — admin backend (Next.js + Material UI) with login, user CRUD, council CRUD, wiki editor.
- **Phase C** — customer-facing mobile PWA: photo capture, £2.99 Stripe paywall (Apple Pay / Google Pay), AI-drafted appeal letter, council auto-submission via Playwright MCP.

Detailed scope lives in `wiki/docs/business/roadmap.md` once the wiki is up.

## Contributing

For Phase A, all changes are markdown edits under `wiki/docs/`. The wiki is fully public.
