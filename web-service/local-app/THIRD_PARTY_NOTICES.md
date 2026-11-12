# Third-party notices

Hyper-RAG: https://github.com/iMoonLab/Hyper-RAG — Apache License 2.0.
`src/app.js` adapts graph options and BubbleSets styling from `web-ui/frontend/src/components/RetrievalHyperGraph/index.tsx`. Changes: standalone G6 integration, custom UI, explicit edge IDs, relation inspector, theme support and local API adapter. Original React wrapper is not included.

G6 and esbuild retain their respective licenses in node_modules. See package-lock.json for resolved dependencies. The original Hyper-RAG license is copied to licenses/Hyper-RAG-LICENSE.

Tabler Icons 3.19.0: https://tabler.io/icons (npm package @tabler/icons) — MIT License, Copyright (c) 2020-2024 Paweł Kuna. `src/tabler-icons.js` holds seventeen outline icons (alert-triangle, alert-circle, file-text, flask, user, book, bulb, arrow-down, external-link, x, chart-bubble, arrows-split-2, grid-dots, circles-relation, checklist, list-details, maximize) as downloaded from https://cdn.jsdelivr.net/npm/@tabler/icons@3.19.0/icons/outline/. The license is copied to licenses/Tabler-Icons-LICENSE.

The local retrieval engine uses Hyper-RAG commit 46ff126. `patch_engine.py` applies an empty-keyword guard and returns structured retrieval context and source chunks for hyper/naive modes. `db_server.py` integrates the team's bilingual keyword prompt and existing DB with a local FastAPI adapter, and replaces the engine's `limit_async_func_call` at run time with `openai_keys.limit_calls`, which gives a failed call's slot back. These modifications are separate from the original upstream distribution. The Docker image (`Dockerfile`) fetches that commit from GitHub during the build and carries it with the patch applied; it includes no team DB.
