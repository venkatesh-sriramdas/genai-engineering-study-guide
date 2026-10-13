/* Follow the Question: interactive lab registry. FROZEN after wave 0. Owner: orchestrator.
   Labs live in assets/js/labs/<id>.js and are loaded on demand.

   A lab file must call:
     Guide.labs.register('kv-cache', {
       mount: function (container, api) { ...build UI into container...; return { destroy: function () {} }; }
     });
   api = { id, save(obj), load() -> obj|null }   (save/load persist per lab in Guide.store when present)
*/
(function () {
  'use strict';
  var G = window.Guide;

  var MANIFEST = [
    { id: 'kv-cache',        world: 'w02', title: 'KV cache sizer',              blurb: 'Size the KV cache for a model, context length and batch, then see how GQA, quantization and paging change what fits on a GPU.' },
    { id: 'prompt-cache',    world: 'w02', title: 'Prompt cache savings',        blurb: 'Model hit rate, prefix stability, cache write charges and TTL to see real cost and latency savings.' },
    { id: 'latency-budget',  world: 'w02', title: 'Latency budget builder',      blurb: 'Stack retrieval, guards, model time to first token and streaming into an end-to-end budget and find the bottleneck.' },
    { id: 'chunk-visualizer',world: 'w04', title: 'Chunking visualizer',         blurb: 'Paste text and compare fixed, recursive, sentence and structure-aware chunking with size, overlap and boundaries.' },
    { id: 'rrf-playground',  world: 'w05', title: 'RRF fusion playground',       blurb: 'Fuse keyword and vector rankings with reciprocal rank fusion, tune k and weights, and watch the final order move.' },
    { id: 'acl-simulator',   world: 'w07', title: 'ACL filter simulator',        blurb: 'Compare pre-filter and post-filter security trimming on recall, latency and leakage as groups and corpus change.' },
    { id: 'context-budget',  world: 'w10', title: 'Context budget planner',      blurb: 'Allocate a context window across instructions, tools, memory, retrieval and history and see what gets compacted.' }
  ];

  var registered = {};
  G.labs = {
    manifest: MANIFEST,
    register: function (id, def) { registered[id] = def; },
    get: function (id) { return registered[id] || null; },
    meta: function (id) { return MANIFEST.filter(function (m) { return m.id === id; })[0] || null; },
    /* Loads the lab script if needed, then mounts it into container. Returns a handle with destroy(). */
    open: function (id, container) {
      if (!G.labs.meta(id)) { container.textContent = 'Unknown lab: ' + id; return Promise.resolve(null); }
      return G.loadScript('assets/js/labs/' + id + '.js').then(function () {
        var def = registered[id];
        if (!def) throw new Error('Lab ' + id + ' did not register');
        var api = {
          id: id,
          save: function (obj) { if (G.store && G.store.setLab) G.store.setLab(id, obj); },
          load: function () { return G.store && G.store.getLab ? G.store.getLab(id) : null; }
        };
        G.clear(container);
        return def.mount(container, api) || { destroy: function () {} };
      }).catch(function (err) {
        console.error(err);
        container.textContent = 'This lab failed to load: ' + err.message;
        return null;
      });
    }
  };
})();
