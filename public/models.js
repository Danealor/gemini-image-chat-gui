// public/models.js
// Client-side cache of the server's model registry plus small capability helpers.
// Loaded before app.js; exposed as the global `ModelRegistry`.

const ModelRegistry = {
  models: [],
  defaultId: null,

  // Fetch the configured models from the server once at startup.
  async load() {
    const res = await fetch('/api/models');
    const data = await res.json();
    this.models = data.models || [];
    this.defaultId = data.default || (this.models[0] && this.models[0].id) || null;
    return this.models;
  },

  get(id) {
    return this.models.find(m => m.id === id);
  },

  capabilities(id) {
    const m = this.get(id);
    return m ? m.capabilities : null;
  },
};

window.ModelRegistry = ModelRegistry;
