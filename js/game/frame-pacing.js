// Game's frame pacing: the FPS counter, dynamic resolution, and the watchdog
// that restores a game canvas hidden mid-match.
// Methods of Game: js/game.js copies them onto Game.prototype.

export class GameFramePacing {
  // Frames actually drawn over the last second, FRAPS-style: an average rather
  // than 1/dt, so the number holds still long enough to read. The watchdog's
  // background ticks draw nothing and are not counted.
  _countFrame(now) {
    if (this._fpsSince == null) { this._fpsSince = now; this._fpsFrames = 0; return; }
    this._fpsFrames++;
    const elapsed = now - this._fpsSince;
    if (elapsed < 1) return;
    this.hud.setFps(Math.round(this._fpsFrames / elapsed));
    this._fpsSince = now;
    this._fpsFrames = 0;
  }

  /**
   * Last-resort recovery from a laid-out-to-nothing canvas.
   *
   * A live match whose canvas is display:none renders every frame into a
   * hidden element: the HUD still updates, audio still plays, input still
   * works, and the player sees pure black with no way out but a reload. That
   * is the single worst failure this game can produce, and it is reachable
   * from any ordering slip in the screen code, so it gets a watchdog rather
   * than only a fix at the one call site that caused it.
   *
   * Deliberately narrow: it only ever REMOVES the utility class, only while a
   * match is actually running, and only when the canvas has no layout box at
   * all. It cannot fight a legitimate hide (menu, lobby), because those states
   * dispose or pause the game rather than leaving it live.
   */
  _healHiddenCanvas() {
    const c = this.canvas;
    if (!c || !c.isConnected || this.paused) return;
    if (c.clientWidth > 0 && c.clientHeight > 0) return;
    if (!c.classList.contains('hidden')) return;   // hidden by layout, not us
    c.classList.remove('hidden');
    c.setAttribute('aria-hidden', 'false');
    console.warn('[render] game canvas was hidden mid-match; restored it');
    this.onResize();
  }

  /**
   * Dynamic resolution.
   *
   * A resolution change is NOT free and it is NOT invisible: it rebuilds every
   * render target in the post stack and the whole image resamples. So the
   * controller's job is not merely to track the frame budget, it is to change
   * as rarely as it possibly can while still rescuing a machine that is
   * genuinely too slow.
   *
   * This used to be pure bang-bang: drop 0.15 above 20ms, raise 0.10 below
   * 16.95ms, re-evaluated every 2s with nothing in between. That is a loop with
   * positive feedback, because dropping the resolution is exactly what pushes
   * the frame time back under the raise threshold, which then pushes it back
   * over the drop threshold. A machine sitting anywhere near 60fps — which is
   * the machine we are targeting — oscillates forever on a 2-second period,
   * and every cycle costs a full target rebuild and a visible resample. Moving
   * is what pushes frame time over the line, so it presented as the whole
   * screen flickering while walking around.
   *
   * Three things make it stable now: a wide neutral band that both thresholds
   * sit outside of, a requirement that several consecutive checks agree before
   * anything moves, and a long cooldown after any change so a rebuild can
   * never be followed immediately by another.
   */
  _tuneRenderScale(dt, now) {
    if (dt <= 0 || dt > 0.1 || !this.renderer) return;
    this._frameEma = this._frameEma == null ? dt : this._frameEma * 0.94 + dt * 0.06;
    if (now < (this._nextScaleCheck || 0)) return;
    this._nextScaleCheck = now + 2;
    const target = this._qualityPixelRatio || 1;
    const cur = this._dynamicPixelRatio || target;

    // Wide neutral band. Dropping below ~46fps is a real problem worth a
    // rebuild; anything from there up to a comfortable 90fps margin is left
    // alone. The old thresholds were 3ms apart, which is less than the frame
    // time a single extra zombie costs.
    const DROP_ABOVE = 1 / 46;    // ~21.7ms — genuinely missing the budget
    const RAISE_BELOW = 1 / 90;   // ~11.1ms — comfortably fast, real headroom
    // Floor BELOW native. It used to be 1, and every quality tier caps the
    // ratio at devicePixelRatio — so on an ordinary pixel-ratio-1 monitor the
    // ceiling was already 1 and the controller could never drop at all. The
    // machines that most needed rescuing were the ones it was locked out of.
    const FLOOR = 0.5;
    let want = 0;
    if (this._frameEma > DROP_ABOVE && cur > FLOOR) want = -1;
    else if (this._frameEma < RAISE_BELOW && cur < target) want = 1;

    // Require consecutive agreeing checks before acting. A burst of zombies, a
    // teleporter effect or one long GC pause must not resize the world.
    if (want === 0 || want !== this._scaleVote) { this._scaleVote = want; this._scaleVotes = 1; return; }
    this._scaleVotes = (this._scaleVotes || 0) + 1;
    // Coming down is a rescue, so it needs less convincing than going up.
    if (this._scaleVotes < (want < 0 ? 2 : 4)) return;
    this._scaleVote = 0; this._scaleVotes = 0;

    // Under 30fps a 0.15 step takes three cooldowns to reach playable, so a
    // badly overloaded machine takes a bigger first bite.
    const drop = this._frameEma > 1 / 30 ? 0.25 : 0.15;
    let next = want < 0 ? Math.max(FLOOR, cur - drop) : Math.min(target, cur + 0.1);
    // Land exactly on the quality ceiling. Five 0.1 steps up from the 0.5 floor
    // sum to 0.9999999999999999, and floor(1920 * that) is a 1919px canvas
    // resampled to 1920 — a permanent full-screen blur that the < 0.01 check
    // below would then refuse to correct.
    if (Math.abs(next - target) < 0.01) next = target;
    if (Math.abs(next - cur) < 0.01) return;
    // Cooldown: after any change, hold for a while regardless of what the EMA
    // does. The EMA needs time to reflect the new cost before it is trustworthy,
    // and this is the backstop that makes an oscillation impossible even if the
    // thresholds are ever retuned badly.
    this._nextScaleCheck = now + 8;
    this._dynamicPixelRatio = next;
    this.renderer.setPixelRatio(next);
    const w = Math.max(1, this.canvas?.clientWidth || innerWidth);
    const h = Math.max(1, this.canvas?.clientHeight || innerHeight);
    this.renderer.setSize(w, h, false);
    // The post stack owns the buffers the scene is actually rendered into, so
    // dynamic resolution has to resize those too — without this the scaler
    // only changed the backbuffer and did nothing for the cost that matters.
    this.postfx?.setSize(w, h, next);
    this.fx?.setViewportHeight(h * next);
  }
}
