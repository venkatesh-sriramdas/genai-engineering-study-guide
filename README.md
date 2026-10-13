---
title: Follow the Question
description: An offline study guide to GenAI and AI engineering, organised by topic with scenario questions that weigh options and trade-offs
ms.date: 2026-10-14
ms.topic: overview
---

A revision guide for GenAI and AI engineering. Every topic has its own page: what it is, how it works, where and when to use it, how it compares with the alternatives, common pitfalls and scenario questions where each option shows its trade-off.

Open the live site: https://venkatesh-sriramdas.github.io/genai-engineering-study-guide/

## What is inside

* 284 topic pages in 20 chapters, listed in [TOPIC-CATALOG.md](TOPIC-CATALOG.md)
* Scenario cards where you pick an option, then see every option's verdict, reasoning and trade-off
* Practice problems and boss rounds with interview-style answers
* Quizzes, flashcards with spaced repetition, dial boards and seven interactive labs
* Per-chapter cheat sheets, search, bookmarks and a progress dashboard

Chapters cover LLM controls and APIs, latency and caching, data ingestion, chunking and indexes, retrieval and RAG patterns, RAG guardrails, RAG security and access control, MCP, A2A, agent and multi-agent patterns, Microsoft Agent Framework, Foundry hosted agents and Agent 365, multimodality, evaluation, observability, cost and reliability, governance and field notes.

## Using the guide

1. Open the live site, or download the repository and open `site/index.html` in a browser. No server is needed.
2. Pick a topic from the left menu. Switch between Topics and Journey views at the top of the menu.
3. Progress is saved in your browser. Use Progress, then Export to keep a copy, and Import to restore it in another browser.

## Building from source

Content lives in `content-src/` as JSON. The build compiles it into `site/content/`.

```bash
node tools/build.mjs      # compile content-src into site/content
node tools/validate.mjs   # check schema, ids, writing rules and topic coverage
```

The site needs Node 18 or later only for these commands. Pushes to `main` publish `site/` through GitHub Pages using `.github/workflows/pages.yml`.

## Status

Product details were checked against official documentation on 2026-10-13. Preview features are labelled. Fact-checking and review are still in progress for part of the content, so verify anything critical against the linked sources.
