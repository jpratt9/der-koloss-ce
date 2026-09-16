export class HUDMinimap {
  drawMinimap(g) {
    const c = this.el.minimap;
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    const B = { minX: -47, maxX: 35, minZ: -65, maxZ: 29 };
    // Uniform scale on both axes. The footprint is 82m x 94m drawn into a
    // square, so an independent per-axis scale squashed it horizontally and
    // the rooms no longer matched the shape of the level the player walks.
    const spanX = B.maxX - B.minX, spanZ = B.maxZ - B.minZ;
    const s = Math.min(W / spanX, H / spanZ);
    const ox = (W - spanX * s) * 0.5, oz = (H - spanZ * s) * 0.5;
    const sx = s, sz = s;
    const X = (x) => ox + (x - B.minX) * s, Z = (z) => oz + (z - B.minZ) * s;
    // OPAQUE backing. This canvas sits on top of the live 3D frame, and the
    // fill used to be 58% alpha over a 42%-alpha frame — so the panel was
    // really a tinted window onto whatever the camera happened to be pointing
    // at. At spawn that is the moonlit sky above the factory wall, which is the
    // brightest thing in the level, so the whole map washed out to a white
    // rectangle and the 44%-alpha room outlines disappeared into it. A HUD
    // element must not depend on the scene behind it to stay legible.
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, W, H);
    if (!g.map) return;
    // room footprints — cold moonlight, so the warm markers read as signal
    ctx.strokeStyle = 'rgba(150,178,210,0.5)';
    ctx.fillStyle = 'rgba(120,148,184,0.09)';
    ctx.lineWidth = 1;
    for (const r of g.map.rooms) {
      const rc = r.rect;
      const rx = X(rc.minX), rz = Z(rc.minZ);
      const rw = (rc.maxX - rc.minX) * sx, rh = (rc.maxZ - rc.minZ) * sz;
      ctx.fillRect(rx, rz, rw, rh);
      ctx.strokeRect(rx, rz, rw, rh);
    }
    // doors: red = closed, green = open, amber = power-sealed
    for (const d of g.map.doors) {
      if (d.preOpen) continue;
      ctx.fillStyle = d.open ? 'rgba(95,208,138,0.9)' : (d.cost == null ? 'rgba(255,180,84,0.9)' : 'rgba(224,69,58,0.9)');
      ctx.fillRect(X(d.x) - 2, Z(d.z) - 2, 4, 4);
    }
    // power switch
    // NOTE: the "on" colour was missing its closing paren, so assigning it was
    // a silent no-op and the powered-up bolt inherited whatever colour the last
    // door happened to leave behind.
    ctx.fillStyle = g.map.power.on ? 'rgba(120,230,120,0.95)' : 'rgba(230,60,50,0.95)';
    ctx.font = '9px sans-serif';
    ctx.fillText('⚡', X(g.map.power.pos.x) - 4, Z(g.map.power.pos.z) + 3);
    // teleporters (blue when linked)
    for (const tp of g.map.teleporters) {
      ctx.fillStyle = tp.linked ? 'rgba(110,170,255,0.95)' : 'rgba(120,120,130,0.8)';
      ctx.fillText(tp.id === 'teleA' ? 'A' : tp.id === 'teleB' ? 'B' : 'C', X(tp.x) - 3, Z(tp.z) + 3);
    }
    // pack-a-punch + box
    ctx.fillStyle = 'rgba(203,162,255,0.92)';
    ctx.fillText('PaP', X(g.map.pap.pos.x) - 6, Z(g.map.pap.pos.z) + 3);
    ctx.fillStyle = 'rgba(255,180,84,0.95)';
    ctx.fillText('?', X(g.map.box.pos.x) - 2, Z(g.map.box.pos.z) + 3);
    // players
    for (const pl of g.minimapPlayers()) {
      ctx.save();
      ctx.translate(X(pl.x), Z(pl.z));
      if (pl.me) {
        ctx.rotate(-pl.yaw);
        // Facing wedge first, so the arrow sits on top of it. Yaw alone in a
        // 7px glyph is almost unreadable; the cone is what actually tells you
        // which way you are pointed at a glance.
        const cone = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
        cone.addColorStop(0, 'rgba(214,228,255,0.34)');
        cone.addColorStop(1, 'rgba(214,228,255,0)');
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 22, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4.5); ctx.lineTo(0, 2.4); ctx.lineTo(-4, 4.5); ctx.closePath(); ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(4,6,11,0.9)';
        ctx.stroke();
      } else {
        // teammates: bold ringed dot in their lobby color (+ down state)
        ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, 7);
        ctx.fillStyle = pl.down ? '#e0453a' : pl.color;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(4,6,11,0.9)';
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
