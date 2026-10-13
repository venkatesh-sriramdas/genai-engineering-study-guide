---
title: Topic Catalog
description: The fixed list of every topic page in the study guide, grouped by chapter, with focus notes for authors and a coverage checklist
ms.date: 2026-10-13
ms.topic: reference
keywords:
  - topics
  - catalog
  - coverage
  - revision
estimated_reading_time: 14
---

## How to read this catalog

Each row is one topic page: a standalone, revision-friendly page that explains the topic, says where and when to use it, compares it with alternatives, lists pitfalls and offers scenario questions with trade-offs. Topic ids are `<chapter>-t<NN>` (for example `w07-t08`) and match the row number.

Rules for authors:

* Cover every row of your chapters. You may merge two adjacent rows only when the merged title names both and the page stays under about 450 words of explanation.
* The Focus column lists what the page must address. Add more where the research supports it.
* Keep a topic self-contained: a reader who jumps straight to it must understand it, with links to related topics for depth.
* Total target: 284 topics, at least 2 scenarios each.

## w00 Orientation (5 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w00-t01 | How this guide works | Start here | Topics, journey, scenario cards, labs, flashcards, progress export and import, facilitator mode |
| w00-t02 | The GenAI system map | Start here | End-to-end stack from data to agents, where each chapter sits, which decisions live where |
| w00-t03 | The Dial-and-Defend answer method | Answering well | Clarify dials, list options, pick, flip conditions, failure modes, metrics |
| w00-t04 | Reading and answering scenario questions | Answering well | How scenario cards work, verdict logic, common traps, how to justify a choice |
| w00-t05 | What changed in 2025 to 2026 | Freshness | Dated map of API, protocol and product changes with GA or preview status |

## w01 LLM controls and APIs (17 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w01-t01 | Tokens and tokenization | Model basics | BPE, token counts, language and number effects, billing impact, counting tools |
| w01-t02 | Context windows and output limits | Model basics | Window vs output cap, max token parameters by API, truncation, budgeting |
| w01-t03 | Reasoning models and reasoning effort | Model basics | Hidden reasoning tokens, effort levels, which parameters are rejected, cost and latency |
| w01-t04 | Temperature and top_p | Sampling and decoding | Mechanics, interplay, typical settings by task, when not to touch them |
| w01-t05 | top_k, seed and determinism | Sampling and decoding | Which APIs expose top_k, best-effort seed, sources of non-determinism |
| w01-t06 | Penalties, logit_bias and stop sequences | Sampling and decoding | Frequency and presence penalties, bias use and misuse, stop design |
| w01-t07 | Logprobs and confidence signals | Sampling and decoding | What logprobs show, classification confidence, calibration limits |
| w01-t08 | Structured outputs vs JSON mode | Structured interaction | Strict schemas, JSON mode, failure handling, schema design, streaming |
| w01-t09 | Function and tool calling | Structured interaction | Tool schema, tool_choice, parallel calls, strict mode, error handling loops |
| w01-t10 | Chat Completions API | API styles | Messages, roles, stateless design, features and limits |
| w01-t11 | Responses API | API styles | Items, store, previous_response_id, Conversations, built-in tools, encrypted reasoning |
| w01-t12 | Chat Completions vs Responses: choosing and migrating | API styles | Decision dials, migration steps, Azure and Anthropic equivalents, Assistants deprecation |
| w01-t13 | Streaming and background mode | API styles | Event streams, partial output handling, background runs and polling |
| w01-t14 | Prompting vs RAG vs long context vs fine-tuning | Adapting models | Decision dials: knowledge freshness, volume, behaviour change, cost, latency |
| w01-t15 | Fine-tuning methods: SFT, DPO, RFT and LoRA | Adapting models | What each changes, data needs, cost, when it pays off, risks |
| w01-t16 | Distillation and small models | Adapting models | Teacher-student, quality gaps, when small beats large |
| w01-t17 | Model routing and cascades | Adapting models | Router types, confidence-based cascades, evaluation of routers, Azure model router |

## w02 Latency, KV cache and prompt caching (17 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w02-t01 | TTFT, TPOT, throughput and queueing | Latency fundamentals | Definitions, what drives each, percentiles, queueing under load |
| w02-t02 | Streaming and perceived latency | Latency fundamentals | Why streaming helps, SSE, UI patterns, when streaming hurts |
| w02-t03 | Prefill vs decode | Latency fundamentals | Compute-bound vs memory-bound phases, prompt length vs output length effects |
| w02-t04 | The KV cache and how big it gets | KV cache and serving | Formula, worked sizing, concurrency limits, what spills |
| w02-t05 | MHA, GQA, MQA and MLA | KV cache and serving | Attention variants, KV reduction factors, quality trade-offs |
| w02-t06 | PagedAttention and fragmentation | KV cache and serving | Block-based KV memory, waste reduction, vLLM concept |
| w02-t07 | Continuous batching and chunked prefill | KV cache and serving | Batching strategies, throughput vs latency, head-of-line blocking |
| w02-t08 | Server-side prefix caching | KV cache and serving | Radix and hash-based reuse, hit conditions, multi-tenant implications |
| w02-t09 | Speculative decoding | KV cache and serving | Draft and verify, acceptance rate, when it helps and when it does not |
| w02-t10 | Quantization: weights and KV cache | KV cache and serving | FP8, INT8, INT4, quality risk, memory and speed effects |
| w02-t11 | Prompt caching: what makes a hit | Prompt caching | Prefix matching, minimum lengths, TTL, what invalidates, measuring hits |
| w02-t12 | OpenAI and Azure OpenAI prompt caching | Prompt caching | Automatic caching, prompt_cache_key, retention, breakpoints, write charges, PTU limits |
| w02-t13 | Anthropic cache_control | Prompt caching | Automatic vs explicit breakpoints, TTLs, multipliers, minimum sizes |
| w02-t14 | Designing prompts for cache hits | Prompt caching | Stable-first ordering, tool order, timestamps, per-tenant keys, hit-rate engineering |
| w02-t15 | Semantic cache | Other caches and budgets | Similarity thresholds, staleness, leakage across users, where it pays |
| w02-t16 | Response and embedding caches | Other caches and budgets | Exact-match caching, embedding reuse, invalidation |
| w02-t17 | End-to-end latency budgets | Other caches and budgets | Stage budgets, parallel guards and retrieval, tail latency, streaming |

## w03 Data ingestion (11 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w03-t01 | Ingestion architectures: indexer, push, event-driven, batch | Architecture | Decision dials: source mix, freshness, scale, ops burden |
| w03-t02 | Source connectors and access patterns | Architecture | SharePoint, Blob and ADLS, OneLake, SQL, Cosmos DB, web, auth and throttling |
| w03-t03 | Text extraction, OCR and layout analysis | Parsing | Native text vs OCR vs layout models, Document Intelligence, cost and quality |
| w03-t04 | Vision LLMs and Content Understanding for parsing | Parsing | When a vision model beats OCR, cost, determinism, validation |
| w03-t05 | Tables, figures and forms | Parsing | Table reconstruction, figure captions, forms, representation choices |
| w03-t06 | Incremental ingestion and change detection | Keeping it fresh | Timestamps, hashes, indexer change tracking, full vs incremental |
| w03-t07 | CDC and event-driven pipelines | Keeping it fresh | Event Grid, change feeds, Debezium style CDC, ordering and exactly-once myths |
| w03-t08 | Idempotency, dedupe and hashing | Keeping it fresh | Stable ids, content hashes, near-duplicate handling, replay safety |
| w03-t09 | Deletes, versioning and re-embedding | Keeping it fresh | Soft deletes, tombstones, blue-green index and alias, embedding model migration |
| w03-t10 | Failure handling: dead letters, backpressure and replay | Quality and failure | DLQ design, retries, rate limits on embedding calls, reprocessing |
| w03-t11 | Quality gates: PII, ACL capture and metadata | Quality and failure | PII detection, capturing permissions at ingest, metadata enrichment, ingestion observability |

## w04 Chunking, embeddings and indexes (19 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w04-t01 | Why chunk and what makes a good chunk | Chunking | Retrieval unit vs generation unit, size effects, evaluating chunks |
| w04-t02 | Fixed-size chunking with overlap | Chunking | Size and overlap trade-offs, token vs character, index inflation |
| w04-t03 | Recursive and sentence-based chunking | Chunking | Separator hierarchies, sentence windows, boundary quality |
| w04-t04 | Semantic chunking | Chunking | Embedding-similarity breakpoints, cost, variance, when it helps |
| w04-t05 | Structure-aware chunking | Chunking | Headings, layout, markdown, section paths as metadata |
| w04-t06 | Parent-child (small-to-big) retrieval | Chunking | Retrieve small, return large, window expansion, index design |
| w04-t07 | Proposition chunking | Chunking | Atomic facts, Dense X Retrieval, cost and recall effects |
| w04-t08 | Contextual retrieval | Chunking | Prepending chunk context, contextual embeddings and BM25, cost with prompt caching |
| w04-t09 | Late chunking | Chunking | Long-context embeddings then pooling, model requirements |
| w04-t10 | Hierarchical summaries (RAPTOR) | Chunking | Tree of summaries, when multi-level retrieval pays |
| w04-t11 | Tables, code and figures | Chunking | Row vs table chunks, code by symbol, figure descriptions |
| w04-t12 | Embedding models and how to choose | Embeddings | Quality vs cost vs latency, MTEB caveats, domain testing, hosted vs open |
| w04-t13 | Dimensions and Matryoshka embeddings | Embeddings | Truncation, dimensions parameter, storage and recall effects |
| w04-t14 | Embedding quantization and rescoring | Embeddings | Scalar and binary quantization, oversampling, rescoring, storage savings |
| w04-t15 | Asymmetric prompts, multilingual and drift | Embeddings | Query vs document prefixes, multilingual behaviour, drift and version pinning |
| w04-t16 | ANN index families: flat, HNSW, IVF, DiskANN | Indexes | How each works, recall, memory, build time, scale thresholds |
| w04-t17 | HNSW parameters | Indexes | m, efConstruction, efSearch, recall and latency effects |
| w04-t18 | Filtered vector search | Indexes | Pre, post and iterative filtering, selectivity effects, recall collapse |
| w04-t19 | Vector store options compared | Indexes | AI Search, Cosmos DB, pgvector, Redis, Qdrant, Pinecone, Elasticsearch, OpenSearch |

## w05 Retrieval and RAG patterns (17 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w05-t01 | RAG pipeline anatomy | Baseline | Stages, where quality is lost, naive vs advanced RAG |
| w05-t02 | Lexical and sparse retrieval (BM25, SPLADE) | Baseline | Term matching, identifiers, learned sparse, strengths and gaps |
| w05-t03 | Dense vector retrieval | Baseline | Semantic matching, failure on rare terms, vector-only risks |
| w05-t04 | Hybrid search and RRF | Baseline | Fusion, k and weights, score normalization pitfalls |
| w05-t05 | Rerankers | Ranking | Semantic ranker, cross-encoders, LLM rerank, ColBERT, latency and cost |
| w05-t06 | Score thresholds and abstention | Ranking | Cutoffs, calibration, when to say not found |
| w05-t07 | Query rewriting | Query transformation | Rewrite for retrieval, conversation context, risks |
| w05-t08 | HyDE | Query transformation | Hypothetical answers as queries, when it helps or misleads |
| w05-t09 | Multi-query and step-back | Query transformation | Fan-out queries, abstraction, cost and dedupe |
| w05-t10 | Decomposition and multi-hop | Query transformation | Sub-questions, iterative retrieval, stop conditions |
| w05-t11 | Metadata filters and self-query | Query transformation | LLM-built filters, validation, injection risk |
| w05-t12 | GraphRAG and LazyGraphRAG | Advanced patterns | Entity graphs, community summaries, global questions, cost |
| w05-t13 | Agentic retrieval and Foundry IQ | Advanced patterns | Query planning, parallel subqueries, knowledge bases and sources, reasoning effort |
| w05-t14 | Corrective and self-reflective RAG | Advanced patterns | CRAG, Self-RAG, retrieval evaluators, loops and cost |
| w05-t15 | RAG vs long context vs cache-augmented generation | Advanced patterns | Decision dials: corpus size, update rate, cost, accuracy |
| w05-t16 | Citations and answer formatting | Output and debugging | Span-level citations, verification, UX |
| w05-t17 | Debugging a bad RAG answer | Output and debugging | Symptom to component method, retrieval vs generation faults |

## w06 RAG guardrails (10 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w06-t01 | Guardrail placement: input, retrieval, output, tool | Placement | Where each guard sits, what it catches, latency |
| w06-t02 | Groundedness and faithfulness checks | Grounding | NLI, LLM judges, quote-then-answer, thresholds |
| w06-t03 | Citation enforcement, abstention and answerability | Grounding | Forcing evidence, refusing safely, answerability classifiers |
| w06-t04 | Harm categories and severities | Azure AI Content Safety | Categories, severity levels, thresholds, text and image |
| w06-t05 | Prompt Shields | Azure AI Content Safety | User prompt attacks vs document attacks, integration points |
| w06-t06 | Groundedness detection and protected material | Azure AI Content Safety | What each detects, status, limits |
| w06-t07 | Platform guardrails in Azure OpenAI and Foundry | Azure AI Content Safety | Content filters, annotations, async filters, guardrail policies |
| w06-t08 | Open-source guard frameworks | Alternatives and operations | NeMo Guardrails, Guardrails AI, Llama Guard, build vs buy |
| w06-t09 | PII detection and redaction | Alternatives and operations | Azure AI Language PII, Presidio, redaction vs masking, reversibility |
| w06-t10 | Guard latency, cost and false positives | Alternatives and operations | Parallel guards, tiering by risk, measuring guard quality |

## w07 RAG security and ACLs (19 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w07-t01 | RAG threat model and OWASP LLM Top 10 2025 | Threats | Assets, trust boundaries, relevant OWASP items |
| w07-t02 | Indirect prompt injection via documents | Threats | Attack paths, EchoLeak style cases, impact |
| w07-t03 | Data poisoning | Threats | PoisonedRAG, ingestion trust, provenance |
| w07-t04 | Embedding and vector weaknesses | Threats | Inversion, collisions, cross-tenant exposure |
| w07-t05 | Exfiltration and sensitive disclosure through output | Threats | Markdown image and link exfiltration, system prompt leakage, output controls |
| w07-t06 | The ACL decision space | Access control options | Dials: permission model, revocation speed, tenancy, scale; overview of options |
| w07-t07 | Post-filtering | Access control options | Mechanics, over-fetch, recall collapse, when acceptable |
| w07-t08 | Pre-filtering with security filters | Access control options | search.in pattern, field design, limits, sync lag |
| w07-t09 | Tenant and user isolation: index per tenant, shared index, per-user namespaces | Access control options | Isolation strength, cost, limits, noisy neighbours |
| w07-t10 | Live source permission checks | Access control options | Check at query time, caching decisions, latency, failure modes |
| w07-t11 | Azure AI Search ACL and RBAC scopes | Access control options | POSIX-like ACLs, ADLS Gen2, query-authorization header, preview status |
| w07-t12 | Purview sensitivity labels and SharePoint ACLs | Access control options | Label enforcement, SharePoint indexer ACLs, limits, preview status |
| w07-t13 | On-behalf-of flow and retrieval identity | Identity | OBO, app identity vs user identity, token handling |
| w07-t14 | Entra groups: overage and nested groups | Identity | Groups claim overage, Graph lookup, transitive membership |
| w07-t15 | ACL sync, drift and revocation | Operations and defences | Sync designs, drift detection, revocation SLAs |
| w07-t16 | Cache and log leakage | Operations and defences | Semantic, prompt, response caches and logs as leak vectors, scoping |
| w07-t17 | Spotlighting and prompt-injection defences | Operations and defences | Spotlighting, shields, instruction isolation, limits of each |
| w07-t18 | Least privilege and output controls | Operations and defences | Retrieval identity scope, tool limits, output filtering, human review |
| w07-t19 | Testing access control | Operations and defences | ACL test suites, red teaming retrieval, leak response runbook |

## w08 Tools and MCP (17 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w08-t01 | Why MCP: hosts, clients and servers | Foundations | Integration problem, roles, message format |
| w08-t02 | Tools | Foundations | Definition, discovery, invocation, who controls, results |
| w08-t03 | Resources and resource templates | Foundations | Context data, URIs, subscriptions, app-controlled use |
| w08-t04 | Prompts | Foundations | User-controlled templates, arguments, use cases |
| w08-t05 | Tool annotations, output schemas and structured content | Foundations | Hints, outputSchema, structuredContent, trust in annotations |
| w08-t06 | Elicitation | Client features | Form and URL modes, safe use, status in 2026-07-28 |
| w08-t07 | Sampling and roots | Client features | What they were, why deprecated, migration advice |
| w08-t08 | Multi round-trip requests and Tasks | Client features | input_required flow, Tasks extension, polling, long-running work |
| w08-t09 | Transports: stdio and Streamable HTTP | Transports and spec | When each fits, legacy HTTP+SSE, deployment shapes |
| w08-t10 | Stateful vs stateless revisions | Transports and spec | 2025-11-25 vs 2026-07-28, discover, per-request capabilities, caching fields |
| w08-t11 | MCP authorization: OAuth 2.1, PRM, CIMD vs DCR | Security | Flows, protected resource metadata, resource indicators, client registration |
| w08-t12 | Token passthrough and the confused deputy | Security | Why passthrough is banned, audience binding, proxy risks |
| w08-t13 | Tool poisoning, rug pulls and SSRF | Security | Attack patterns, pinning, review, sandboxing |
| w08-t14 | Tool design and token cost | Design and operations | Names, descriptions, schemas, result size, cost of tool lists |
| w08-t15 | Scaling tool catalogs: tool search and caching | Design and operations | Tool search, deterministic ordering, prompt cache effects |
| w08-t16 | Gateways, registry and governance | Design and operations | API Management and Foundry Toolbox, registry, approval workflows |
| w08-t17 | Function calling vs MCP vs OpenAPI tools | Design and operations | Decision dials: reuse, ownership, auth, latency |

## w09 A2A and interop (10 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w09-t01 | Why A2A and opaque agents | Concepts | Problem, opaque execution, governance of the standard |
| w09-t02 | A2A vs MCP vs agent-as-tool | Concepts | Decision dials: ownership, trust, state, latency |
| w09-t03 | Agent Card and discovery | Protocol | Location, skills, capabilities, security schemes, signing, registries |
| w09-t04 | Task lifecycle and states | Protocol | States, transitions, terminal vs interrupted |
| w09-t05 | Message, Part and Artifact | Protocol | Content model, modalities, artifacts vs messages |
| w09-t06 | Operations and protocol bindings | Protocol | Send, stream, get, list, cancel; JSON-RPC, gRPC, HTTP+JSON |
| w09-t07 | Streaming, polling and push notifications | Interaction modes | Choosing by task duration, webhook security |
| w09-t08 | Long-running and input-required tasks | Interaction modes | Human or agent input, resumption, timeouts |
| w09-t09 | A2A authentication and trust | Security and platforms | Schemes, delegated identity, signed cards, trust boundaries |
| w09-t10 | A2A in Agent Framework and Foundry | Security and platforms | Hosting, calling, tool wrappers, interop pitfalls |

## w10 Agent and multi-agent patterns (22 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w10-t01 | Workflows vs agents: the autonomy dial | Workflow patterns | Who decides the next step, predictability vs flexibility |
| w10-t02 | Prompt chaining | Workflow patterns | Gates between steps, failure isolation, latency |
| w10-t03 | Routing | Workflow patterns | Classifier routers, cost savings, misroute risks |
| w10-t04 | Parallelization | Workflow patterns | Sectioning vs voting, aggregation, cost |
| w10-t05 | Orchestrator-workers | Workflow patterns | Dynamic decomposition, synthesis, context passing |
| w10-t06 | Evaluator-optimizer | Workflow patterns | Critic loops, stop criteria, cost and diminishing returns |
| w10-t07 | ReAct | Reasoning loops | Thought-action-observation, tool use, failure modes |
| w10-t08 | Plan-and-execute | Reasoning loops | Upfront plans, replanning, brittleness |
| w10-t09 | Reflection and self-critique | Reasoning loops | When self-critique helps, bias, verification with tools |
| w10-t10 | Loop guards, budgets and stop conditions | Reasoning loops | Step caps, token and cost budgets, repetition detection |
| w10-t11 | Single vs multi-agent: the decision | Multi-agent | Latency, cost, context isolation, debuggability, blast radius, evidence |
| w10-t12 | Supervisor pattern | Multi-agent | Central coordination, bottlenecks, context handling |
| w10-t13 | Handoff and swarm | Multi-agent | Control transfer, state passing, loops |
| w10-t14 | Group chat and debate | Multi-agent | Speaker selection, termination, cost |
| w10-t15 | Dynamic task ledgers (Magentic) | Multi-agent | Planner and ledger, progress tracking, stalls |
| w10-t16 | Multi-agent failure modes | Multi-agent | MAST taxonomy, coordination faults, verification gaps |
| w10-t17 | Context engineering | Context and memory | Context budgeting, instruction placement, tool results |
| w10-t18 | Context rot and compaction | Context and memory | Degradation with length, summarization, offloading, sub-agent isolation |
| w10-t19 | Memory types | Context and memory | Working, episodic, semantic, procedural, stores |
| w10-t20 | Memory policies, poisoning and privacy | Context and memory | What to write, retrieval, expiry, poisoning, user data rights |
| w10-t21 | Durable execution and checkpoints | Long-running agents | Persisted state, resume, Durable Task, workflow engines |
| w10-t22 | Human-in-the-loop patterns and idempotency | Long-running agents | Approval gates, retries, compensation, exactly-once myths |

## w11 Microsoft Agent Framework (27 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w11-t01 | What Agent Framework is, and its Semantic Kernel and AutoGen lineage | Foundations | Scope, languages and status, relationship to predecessors |
| w11-t02 | Agent vs Harness Agent vs Workflow | Foundations | What each adds, decision dials, composition |
| w11-t03 | Chat clients and the agent pipeline | Foundations | Providers, pipeline layers, where extensions plug in |
| w11-t04 | Middleware: agent, chat and function | Behaviour | Three kinds, ordering, use cases such as guardrails and logging |
| w11-t05 | Tools and function invocation | Behaviour | Function tools, MCP and hosted tools, iteration limits |
| w11-t06 | Tool approval and standing approvals | Behaviour | Per-call approval, auto-approval rules, risk tiers |
| w11-t07 | Skills | Behaviour | Modular reusable behaviours, discovery, when to use |
| w11-t08 | Planning, todos and agent modes | Behaviour | Harness plan and execute modes, todo tracking |
| w11-t09 | Looping and bounded retries | Behaviour | Evaluator-driven loops, caps |
| w11-t10 | Sessions | State and memory | Session state, serialization, resumption |
| w11-t11 | History providers | State and memory | Chat history storage, per-service-call persistence, stores |
| w11-t12 | Context providers and memory | State and memory | Injecting memory, RAG, dynamic instructions, long-term memory options |
| w11-t13 | Compaction | State and memory | Token limits, strategies, fidelity loss |
| w11-t14 | Executors, edges and supersteps | Workflows | Graph model, edge types, execution semantics |
| w11-t15 | Shared state and checkpoints | Workflows | State scopes, checkpoint contents, storage, resume semantics |
| w11-t16 | Human-in-the-loop in workflows | Workflows | Requests and responses, pending state across checkpoints |
| w11-t17 | Workflows as agents, sub-workflows and declarative workflows | Workflows | Composition, YAML definitions, reuse |
| w11-t18 | Sequential orchestration | Orchestrations | Pipeline of agents, handoff of context, use cases |
| w11-t19 | Concurrent orchestration | Orchestrations | Fan-out and aggregation, latency vs cost |
| w11-t20 | Handoff orchestration | Orchestrations | Specialist routing, control transfer |
| w11-t21 | Group chat orchestration | Orchestrations | Shared conversation, selection strategy, termination |
| w11-t22 | Magentic orchestration | Orchestrations | Manager agent, task ledger, when worth the cost |
| w11-t23 | Choosing an orchestration | Orchestrations | Decision matrix across the five patterns |
| w11-t24 | Background responses and durable agents | Operate | Continuation tokens, Durable Task, Azure Functions |
| w11-t25 | Hosting: A2A, AG-UI, OpenAI-compatible and Foundry hosted | Operate | Hosting options and protocol choices |
| w11-t26 | Built-in observability and evaluation hooks | Operate | OTel spans, enabling telemetry, sensitive data flag, eval integration |
| w11-t27 | Migrating from Semantic Kernel and AutoGen | Operate | Concept mapping, migration steps, pitfalls |

## w12 Foundry, hosted agents and Agent 365 (19 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w12-t01 | Foundry Agent Service map and agent types | Foundry Agent Service | Components, prompt, voice and hosted agents |
| w12-t02 | Prompt and voice agents | Foundry Agent Service | Config-only agents, Voice Live integration, limits |
| w12-t03 | Hosted agents overview | Foundry Agent Service | Containerized code, supported frameworks, when to use |
| w12-t04 | Hosted agent protocols | Foundry Agent Service | Responses, Invocations, Invocations WebSocket, Activity |
| w12-t05 | Sessions, sandbox lifecycle and state | Foundry Agent Service | Active, idle, resumed, $HOME and /files, persistence |
| w12-t06 | Versions, scaling, networking and identity of hosted agents | Foundry Agent Service | Version rollbacks, scale behaviour, network isolation, agent identity |
| w12-t07 | Responses API direct vs agents | Foundry Agent Service | Decision dials: control, state, operations |
| w12-t08 | Toolboxes and the managed MCP endpoint | Tools and knowledge | Curated tool sets, central auth and governance |
| w12-t09 | Built-in tools | Tools and knowledge | File search, code interpreter, web search, Azure AI Search, SharePoint, OpenAPI, Functions, Logic Apps |
| w12-t10 | Foundry IQ knowledge bases | Tools and knowledge | Knowledge sources, agentic retrieval, permission awareness |
| w12-t11 | Connected agents vs A2A tool | Tools and knowledge | Differences, when to use which |
| w12-t12 | Memory in Foundry | Tools and knowledge | Memory stores, scope, preview status |
| w12-t13 | Publishing: Teams, Microsoft 365 Copilot and the Entra Agent Registry | Publish and operate | Channels, versions, endpoints |
| w12-t14 | Tracing, evaluation and the agent optimizer | Publish and operate | Foundry observability, evaluators, optimizer preview |
| w12-t15 | Entra Agent ID: blueprints, identities and agent users | Identity and governance | Concepts, lifecycle, sponsors |
| w12-t16 | Autonomous vs on-behalf-of agents | Identity and governance | Access modes, accountability, consent |
| w12-t17 | Agent 365: observe, govern, secure | Identity and governance | Pillars, availability and licensing, GA 2026-05-01 |
| w12-t18 | Agent 365 registry, Purview and Defender | Identity and governance | Registry and map, data protection, threat detection |
| w12-t19 | Runtime choice matrix | Identity and governance | Prompt agent vs hosted vs AKS or Container Apps vs Copilot Studio |

## w13 Multimodality (13 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w13-t01 | Modalities landscape and choosing a modality | Foundations | Text, image, audio, video, documents, decision dials |
| w13-t02 | Image input: detail levels, token cost and limits | Vision | Tile-based cost, detail parameter, size limits |
| w13-t03 | Vision failure modes | Vision | Counting, spatial reasoning, small text, charts, mitigation |
| w13-t04 | Audio input and speech output | Audio and voice | Transcription, TTS, models, batch vs streaming |
| w13-t05 | Realtime speech-to-speech | Audio and voice | Realtime API transports, latency, control |
| w13-t06 | Cascaded vs speech-to-speech pipelines | Audio and voice | Decision dials: latency, control, cost, tool use |
| w13-t07 | Voice Live and turn detection | Audio and voice | Managed voice pipeline, VAD, semantic turn detection |
| w13-t08 | Video understanding | Video and documents | Frame sampling, cost, Content Understanding |
| w13-t09 | Document understanding: OCR vs layout vs vision LLM | Video and documents | Decision dials and quality checks |
| w13-t10 | Multimodal embeddings | Multimodal retrieval | Shared embedding spaces, models, limits |
| w13-t11 | ColPali and page-image retrieval | Multimodal retrieval | Late interaction over page images, cost and index size |
| w13-t12 | Caption-then-embed vs multimodal embeddings vs page images | Multimodal retrieval | Decision dials and evaluation |
| w13-t13 | Multimodal safety: image injection, content safety and PII | Safety | Image prompt injection, moderation, face and PII handling |

## w14 Evaluation (15 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w14-t01 | Why LLM evaluation is different | Foundations | Non-determinism, open-ended outputs, layered failure |
| w14-t02 | Offline vs online evaluation | Foundations | Purpose, timing, signals |
| w14-t03 | Component vs end-to-end evaluation | Foundations | Isolating faults, test pyramid |
| w14-t04 | Golden datasets | Data | Sourcing, labelling, versioning, contamination |
| w14-t05 | Synthetic data generation | Data | Generators, review, bias, coverage |
| w14-t06 | Retrieval metrics | Metrics | Precision@k, recall@k, MRR, nDCG, hit rate |
| w14-t07 | RAGAS metrics | Metrics | Faithfulness, answer relevancy, context precision and recall, noise sensitivity |
| w14-t08 | Foundry and Azure AI Evaluation evaluators | Metrics | Quality, safety and agent evaluators, custom evaluators |
| w14-t09 | LLM-as-judge setups | Judges | Rubrics, pairwise, reference-based, cost |
| w14-t10 | Judge biases and calibration | Judges | Position, verbosity, self-preference, calibration to humans |
| w14-t11 | Agent trajectory and tool-call evaluation | Agents and safety | Trajectories, tool selection accuracy, task adherence |
| w14-t12 | Non-determinism, pass^k and significance | Agents and safety | Repeated trials, confidence intervals |
| w14-t13 | Red teaming and safety evaluation | Agents and safety | PyRIT, Foundry red teaming agent, harm benchmarks |
| w14-t14 | CI gates and regression testing | Operating | Thresholds, flaky tests, cost control |
| w14-t15 | A/B, shadow, canary and feedback signals | Operating | Online experiments, user feedback, guardrails for rollout |

## w15 Observability (12 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w15-t01 | What to observe in LLM systems | Foundations | Differences from classic services, signals that matter |
| w15-t02 | OTel GenAI semantic conventions | Standards | Status, naming, attribute families |
| w15-t03 | Spans for chat, agent and tool calls | Standards | chat, invoke_agent, execute_tool, nesting |
| w15-t04 | Metrics: tokens, duration and cost | Standards | Token usage and operation duration metrics, cost attribution |
| w15-t05 | Trace propagation across services | Distributed tracing | traceparent, MCP _meta, A2A, async hops |
| w15-t06 | Content capture, redaction and privacy | Privacy and volume | Opt-in content, redaction, access control |
| w15-t07 | Sampling and retention | Privacy and volume | Head vs tail sampling, retention tiers, cost |
| w15-t08 | Foundry tracing and Application Insights | Platforms | Setup, views, queries |
| w15-t09 | Agent Framework built-in telemetry | Platforms | Enabling, spans produced, sensitive data flag |
| w15-t10 | Dashboards, SLIs, SLOs and alerts | Operating | TTFT, error rate, quality scores, burn alerts |
| w15-t11 | Online quality monitoring | Operating | Sampling traces for evals, drift detection |
| w15-t12 | Tooling landscape | Operating | Langfuse, Phoenix, LangSmith, Azure Monitor, build vs buy |

## w16 Cost, scale and reliability (11 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w16-t01 | Where the money goes: token economics | Cost | Input vs output, cached tokens, tool and reasoning tokens |
| w16-t02 | Cost levers | Cost | Prompt size, caching, model choice, batching, output limits |
| w16-t03 | Routing and cascades as a cost lever | Cost | Savings model, quality guards |
| w16-t04 | Quotas, TPM, RPM and 429s | Capacity | How limits work, retry-after, token-based limiting |
| w16-t05 | Deployment types and capacity: PAYG, global, data zone, PTU | Capacity | Decision dials: traffic shape, residency, latency |
| w16-t06 | Batch, flex and async | Capacity | Discounts, windows, workloads that fit |
| w16-t07 | API Management AI gateway | Gateway and resilience | Token limits, load balancing, semantic cache, circuit breaker |
| w16-t08 | Retries, timeouts and jitter | Gateway and resilience | Safe retries, idempotency, budgets |
| w16-t09 | Circuit breakers, bulkheads and hedging | Gateway and resilience | Failure isolation, tail latency |
| w16-t10 | Fallbacks and graceful degradation | Gateway and resilience | Model fallbacks, reduced features, honesty to users |
| w16-t11 | Regional failover and capacity planning | Gateway and resilience | Multi-region design, SLOs, load tests |

## w17 Governance and human oversight (9 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w17-t01 | Human oversight models | Oversight | Human in, on and over the loop, risk and friction |
| w17-t02 | Approval gates and escalation | Oversight | Action risk tiers, reversibility, escalation paths |
| w17-t03 | Audit logging and accountability | Oversight | What to log, retention, accountability chains |
| w17-t04 | EU AI Act | Regulation and standards | Dated obligations, risk tiers, GPAI duties, 2026 changes |
| w17-t05 | NIST AI RMF and the GenAI profile | Regulation and standards | Govern, map, measure, manage, AI 600-1 |
| w17-t06 | ISO/IEC 42001 and the Microsoft Responsible AI Standard | Regulation and standards | Management system, certification, internal standards |
| w17-t07 | Agent governance lifecycle | Operating governance | Inventory, identity, permissions, review, retirement |
| w17-t08 | Documentation and transparency | Operating governance | Model and system cards, user disclosure |
| w17-t09 | AI incident response | Operating governance | Detection, containment, communication, learning |

## w18 Field notes (14 topics)

| ID | Topic | Group | Focus |
|---|---|---|---|
| w18-t01 | Reasoning models and test-time compute | Models | Effort, thinking budgets, when reasoning pays |
| w18-t02 | Instruction hierarchy | Models | Developer, user and tool messages, conflicts, injection |
| w18-t03 | Prompt versioning and LLMOps | Operating prompts | Versioning, canary, eval gates, rollback |
| w18-t04 | Prompt optimization | Operating prompts | DSPy style optimizers, Foundry agent optimizer, risks |
| w18-t05 | Serving open models | Deployment | vLLM, SGLang, Ollama, Foundry Local, KAITO, when to self-host |
| w18-t06 | Data residency, ZDR, keys and private endpoints | Deployment | Residency options, zero data retention, customer-managed keys, private networking |
| w18-t07 | Text-to-SQL | Specialised agents | Schema linking, read-only roles, validation, failure modes |
| w18-t08 | Code interpreter and sandboxes | Specialised agents | Isolation, dynamic sessions, resource limits |
| w18-t09 | Computer-use and browser agents | Specialised agents | Capabilities, risks, confirmations |
| w18-t10 | Deep research agents | Specialised agents | Long-horizon research, cost, verification |
| w18-t11 | AG-UI | Specialised agents | Agent to UI streaming protocol, use cases |
| w18-t12 | Tokenization pitfalls | Pitfalls | Numbers, multilingual text, whitespace, cost surprises |
| w18-t13 | Hallucination taxonomy | Pitfalls | Intrinsic vs extrinsic, causes, mitigations by type |
| w18-t14 | Answer craft for architecture interviews | Pitfalls | Structure, time boxing, trade-off language, common mistakes |

## Coverage checklist against the original request

| Requested | Topics |
|---|---|
| RAG, ingestion, chunking, tools, services | w03, w04, w05 |
| RAG guardrails and techniques | w05-t07 to w05-t15, w06 |
| Scenario-based questions with trade-offs | Scenario cards on every topic, defend rounds, w19 |
| Security in RAG, ACLs, approaches | w07 |
| Latency, prompt caching, KV caching and parameters | w02, w01-t04 to w01-t07 |
| Chat Completions vs Responses API | w01-t10 to w01-t13 |
| MCP tools, resources and more | w08 |
| A2A | w09 |
| Agent patterns and multi-agent patterns | w10 |
| Evaluations | w14 |
| Observability | w15 |
| Foundry services and hosted agents | w12-t01 to w12-t14 |
| Agent 365 | w12-t15 to w12-t18 |
| Microsoft Agent Framework (agent vs harness, memory, checkpoint, workflows, multi-agent, long-running, middleware, observability) | w11 |
| Multimodality | w13 |
| Anything else missed | w16, w17, w18 |
