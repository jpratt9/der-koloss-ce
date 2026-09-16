// ---------------------------------------------------------------------------
// Binary heap keyed on f-score. Typed arrays, reused across searches.
// ---------------------------------------------------------------------------
export class Heap {
  constructor(cap) {
    this.node = new Int32Array(cap);
    this.f = new Float32Array(cap);
    this.n = 0;
    this.cap = cap;
  }

  clear() { this.n = 0; }

  push(node, f) {
    // GROW, never drop. A heap that silently discards pushes when it fills does
    // not slow the search down, it AMPUTATES it: the open set drains, the loop
    // exits with the frontier empty, and the caller is handed a partial route
    // that looks exactly like a genuinely unreachable target. That is worth
    // spelling out because it cost a debugging session — every long cross-map
    // path failed while every short one worked, which reads like a budget
    // problem and is not one. The open set holds one entry per g-improvement,
    // so it is legitimately larger than the node count.
    if (this.n >= this.cap) this._grow();
    let i = this.n++;
    this.node[i] = node; this.f[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= this.f[i]) break;
      this._swap(p, i); i = p;
    }
  }

  pop() {
    const top = this.node[0];
    if (--this.n > 0) {
      this.node[0] = this.node[this.n]; this.f[0] = this.f[this.n];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < this.n && this.f[l] < this.f[s]) s = l;
        if (r < this.n && this.f[r] < this.f[s]) s = r;
        if (s === i) break;
        this._swap(s, i); i = s;
      }
    }
    return top;
  }

  _swap(a, b) {
    const tn = this.node[a]; this.node[a] = this.node[b]; this.node[b] = tn;
    const tf = this.f[a]; this.f[a] = this.f[b]; this.f[b] = tf;
  }

  _grow() {
    this.cap *= 2;
    const node = new Int32Array(this.cap); node.set(this.node); this.node = node;
    const f = new Float32Array(this.cap); f.set(this.f); this.f = f;
  }
}

