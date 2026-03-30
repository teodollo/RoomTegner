const api = {
  _headers() {
    return { 'Content-Type': 'application/json', 'X-API-Key': window.API_KEY || '' };
  },
  async list() {
    const r = await fetch('/api/sketches', { headers: this._headers() });
    return r.json();
  },
  async get(id) {
    const r = await fetch(`/api/sketches/${id}`, { headers: this._headers() });
    return r.json();
  },
  async create(name, customer, data, thumbnail) {
    const r = await fetch('/api/sketches', {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ name, customer, data, thumbnail })
    });
    return r.json();
  },
  async update(id, payload) {
    const r = await fetch(`/api/sketches/${id}`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(payload)
    });
    return r.json();
  },
  async delete(id) {
    const r = await fetch(`/api/sketches/${id}`, { method: 'DELETE', headers: this._headers() });
    return r.json();
  }
};