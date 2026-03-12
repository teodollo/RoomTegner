const api = {
  async list() {
    const r = await fetch('/api/sketches');
    return r.json();
  },
  async get(id) {
    const r = await fetch(`/api/sketches/${id}`);
    return r.json();
  },
  async create(name, customer, data, thumbnail) {
    const r = await fetch('/api/sketches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, customer, data, thumbnail })
    });
    return r.json();
  },
  async update(id, payload) {
    const r = await fetch(`/api/sketches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return r.json();
  },
  async delete(id) {
    const r = await fetch(`/api/sketches/${id}`, { method: 'DELETE' });
    return r.json();
  }
};
