import * as THREE from 'three';

export class PostFXRender {
  // ----------------------------------------------------------------- render
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} dt
   * @param {Function} [drawViewmodel] optional callback rendering the weapon on
   *        top of the world into the same HDR target with its own FOV.
   */
  render(scene, camera, dt = 0.016, drawViewmodel = null) {
    const r = this.renderer;
    if (!this.enabled || !this.sceneRT) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    this.frame++;
    const p = this.preset;
    const near = camera.near, far = camera.far;

    // ---- 1. world into the HDR buffer ----
    const prevAutoClear = r.autoClear;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    camera.updateMatrixWorld();
    this._projInv.copy(camera.projectionMatrixInverse);
    this._viewInv.copy(camera.matrixWorld);
    this._camPos.setFromMatrixPosition(camera.matrixWorld);
    this._curViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    const depthTex = this.sceneRT.depthTexture;

    // ---- 2. ambient occlusion (half res + bilateral blur) ----
    let aoTex = null;
    if (p.aoScale > 0 && this.aoStrength > 0.001) {
      const ao = this.aoPass;
      ao.set('uDepth', depthTex);
      ao.uniforms.uProjInv.value.copy(this._projInv);
      ao.uniforms.uProj.value.copy(camera.projectionMatrix);
      ao.uniforms.uResolution.value.set(this.aoW, this.aoH);
      ao.set('uNear', near).set('uFar', far).set('uFrame', this.frame % 64);
      ao.set('uRadius', this.aoRadius).set('uIntensity', this.aoIntensity);
      ao.render(r, this.aoRT);

      const bl = this.aoBlurPass;
      bl.set('uNear', near).set('uFar', far);
      bl.uniforms.uTexel.value.set(1 / this.aoW, 1 / this.aoH);
      bl.set('uAO', this.aoRT.texture);
      bl.uniforms.uDir.value.set(1, 0);
      bl.render(r, this.aoRT2);
      bl.set('uAO', this.aoRT2.texture);
      bl.uniforms.uDir.value.set(0, 1);
      bl.render(r, this.aoRT);
      aoTex = this.aoRT.texture;
    }

    // ---- 3. volumetric light shafts ----
    let volTex = null;
    if (p.volScale > 0 && this.volDensity > 1e-5) {
      const v = this.volPass;
      const light = this.shadowLight;
      const shadowMap = light?.shadow?.map?.texture || null;
      v.set('uDepth', depthTex);
      v.set('uShadow', shadowMap || this.blackTexture);
      if (shadowMap) v.uniforms.uShadowMatrix.value.copy(light.shadow.matrix);
      else v.uniforms.uShadowMatrix.value.copy(this._identityShadow);
      v.uniforms.uProjInv.value.copy(this._projInv);
      v.uniforms.uViewInv.value.copy(this._viewInv);
      v.uniforms.uCamPos.value.copy(this._camPos);
      v.uniforms.uSunDir.value.copy(this.sunDir);
      v.uniforms.uSunColor.value.set(this.sunColor.r, this.sunColor.g, this.sunColor.b);
      v.uniforms.uAmbientColor.value.set(this.volAmbientColor.r, this.volAmbientColor.g, this.volAmbientColor.b);
      v.set('uNear', near).set('uFar', far).set('uFrame', this.frame % 64);
      v.set('uDensity', shadowMap ? this.volDensity : this.volDensity * 0.6);
      v.set('uHeightFalloff', this.volHeightFalloff).set('uFogBase', this.volFogBase);
      v.set('uAnisotropy', this.volAnisotropy).set('uMaxDist', this.volMaxDist);
      v.set('uAmbient', this.volAmbient);
      // Nearest practicals, refreshed by the game each frame.
      const pp = v.uniforms.uPointPos.value;
      const pc = v.uniforms.uPointColor.value;
      const list = this.volLights;
      for (let i = 0; i < pp.length; i++) {
        const L = list && list[i];
        if (L) {
          pp[i].set(L.x, L.y, L.z, L.radius);
          pc[i].set(L.r, L.g, L.b, L.intensity);
        } else {
          pc[i].w = 0;
        }
      }
      v.render(r, this.volRT);
      volTex = this.volRT.texture;
    }

    // ---- 4. resolve AO + shafts onto the scene color ----
    let src = this.hdrA;
    {
      const rp = this.resolvePass;
      rp.set('uColor', this.sceneRT.texture);
      rp.set('uVolume', volTex || this.blackTexture);
      rp.set('uAO', aoTex || this.blackTexture);
      rp.set('uDepth', depthTex);
      rp.uniforms.uTexelHalf.value.set(1 / this.aoW, 1 / this.aoH);
      rp.set('uNear', near).set('uFar', far);
      rp.set('uAOStrength', aoTex ? this.aoStrength : 0);
      // The 1x1 black fallback has a = 1, so `col * vol.a + vol.rgb` is a no-op
      // when volumetrics are off — no branch or shader variant needed.
      rp.render(r, src);
    }

    // ---- 4b. screen-space reflections on standing water ----
    if (p.ssr && this.ssrStrength > 0.001) {
      const sp = this.ssrPass;
      sp.set('uColor', src.texture).set('uDepth', depthTex);
      sp.uniforms.uProj.value.copy(camera.projectionMatrix);
      sp.uniforms.uProjInv.value.copy(this._projInv);
      sp.uniforms.uViewInv.value.copy(this._viewInv);
      sp.uniforms.uResolution.value.set(this.bufW, this.bufH);
      sp.set('uNear', near).set('uFar', far).set('uFrame', this.frame % 64);
      sp.set('uStrength', this.ssrStrength).set('uMaxDist', this.ssrMaxDist);
      sp.set('uThickness', this.ssrThickness);
      sp.set('uWetScale', this.ssrWetScale).set('uWetHeight', this.ssrWetHeight);
      const dst = src === this.hdrA ? this.hdrB : this.hdrA;
      sp.render(r, dst);
      src = dst;
    }

    // ---- 5. camera motion blur ----
    // A teleport, respawn or spectator switch moves the camera metres in one
    // frame; reprojecting against the old matrix would smear the whole screen.
    // Treat any jump beyond a plausible single-frame step as a cut.
    const jumped = this._prevCamPos
      ? this._camPos.distanceToSquared(this._prevCamPos) > Math.max(0.25, (24 * dt) ** 2)
      : true;
    (this._prevCamPos || (this._prevCamPos = new THREE.Vector3())).copy(this._camPos);
    if (jumped) this._prevViewProj.copy(this._curViewProj);

    if (p.motionBlur && this.motionBlurStrength > 0.001 && this.frame > 2 && !jumped) {
      const mb = this.mbPass;
      mb.set('uColor', src.texture);
      mb.set('uDepth', depthTex);
      mb.uniforms.uProjInv.value.copy(this._projInv);
      mb.uniforms.uViewInv.value.copy(this._viewInv);
      mb.uniforms.uPrevViewProj.value.copy(this._prevViewProj);
      mb.uniforms.uResolution.value.set(this.bufW, this.bufH);
      // Normalize against frame time so blur length is shutter-based, not fps-based.
      mb.set('uStrength', this.motionBlurStrength * Math.min(2.5, (1 / 60) / Math.max(1e-4, dt)));
      mb.set('uFrame', this.frame % 64);
      const dst = src === this.hdrA ? this.hdrB : this.hdrA;
      mb.render(r, dst);
      src = dst;
    }

    // ---- 6. depth of field ----
    if (p.dof && this.dofMaxBlur > 0.5) {
      const dp = this.dofPass;
      dp.set('uColor', src.texture).set('uDepth', depthTex);
      dp.uniforms.uTexel.value.set(1 / this.bufW, 1 / this.bufH);
      dp.set('uNear', near).set('uFar', far);
      dp.set('uFocusDist', this.dofFocus).set('uFocusRange', this.dofRange);
      dp.set('uMaxBlur', this.dofMaxBlur).set('uFrame', this.frame % 64);
      const dst = src === this.hdrA ? this.hdrB : this.hdrA;
      dp.render(r, dst);
      src = dst;
    }

    // ---- 6b. viewmodel ----
    // Drawn once every depth-consuming pass has finished, straight into the
    // current HDR buffer. That order is deliberate: the weapon still picks up
    // bloom, tone mapping, grading, grain and AA, but it is excluded from
    // SSAO, volumetrics, motion blur and depth of field — a weapon welded to
    // the camera should neither smear when you turn nor cast a wall of
    // occlusion across the whole screen.
    if (drawViewmodel) {
      r.autoClear = false;
      // The weapon is one object in a frame that has already cost a world pass,
      // AO and volumetrics. If it fails to draw, finish the frame without it and
      // show the player the world, rather than losing the whole image to the gun.
      try {
        drawViewmodel(src);
      } catch (e) {
        if (!this._vmDrawFailed) { this._vmDrawFailed = true; console.error('viewmodel draw failed', e); }
        r.setRenderTarget(src);
      }
      r.autoClear = prevAutoClear;
    }

    // ---- 7. bloom chain ----
    let bloomTex = this.blackTexture;
    if (this.bloomRTs.length && this.bloomStrength > 0.001) {
      const pre = this.bloomPre;
      pre.set('uColor', src.texture).set('uThreshold', this.bloomThreshold);
      pre.uniforms.uTexel.value.set(1 / this.bufW, 1 / this.bufH);
      pre.render(r, this.bloomRTs[0]);

      for (let i = 1; i < this.bloomRTs.length; i++) {
        const from = this.bloomRTs[i - 1];
        this.bloomDown.set('uColor', from.texture);
        this.bloomDown.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
        this.bloomDown.render(r, this.bloomRTs[i]);
      }

      const last = this.bloomRTs.length - 1;
      let current = this.bloomRTs[last];
      for (let i = last - 1; i >= 0; i--) {
        const up = this.bloomUp;
        up.set('uColor', current.texture);
        up.set('uPrev', this.bloomRTs[i].texture);
        up.uniforms.uTexel.value.set(1 / current.width, 1 / current.height);
        up.set('uRadius', 1.25);
        up.render(r, this.bloomUpRTs[i]);
        current = this.bloomUpRTs[i];
      }
      bloomTex = current.texture;
    }

    // ---- 7b. auto-exposure measurement ----
    if (this.autoExposure > 0.001 && this.lumRTs.length && this.adaptRT) {
      const ld = this.lumDownPass;
      let from = src.texture, fromW = this.bufW, fromH = this.bufH;
      for (let i = 0; i < this.lumRTs.length; i++) {
        ld.set('uColor', from).set('uIsFirst', i === 0 ? 1 : 0);
        ld.uniforms.uTexel.value.set(1 / fromW, 1 / fromH);
        ld.render(r, this.lumRTs[i]);
        from = this.lumRTs[i].texture; fromW = this.lumRTs[i].width; fromH = this.lumRTs[i].height;
      }
      const prev = this.adaptRT[this.adaptIndex];
      const next = this.adaptRT[1 - this.adaptIndex];
      const ap = this.lumAdaptPass;
      ap.set('uCurrent', this.lumRTs[this.lumRTs.length - 1].texture);
      ap.set('uPrevious', this._adaptPrimed ? prev.texture : this.blackTexture);
      ap.set('uDt', Math.min(0.1, dt)).set('uSpeedUp', this.adaptUp).set('uSpeedDown', this.adaptDown);
      ap.set('uMinLum', this.minLum).set('uMaxLum', this.maxLum);
      ap.render(r, next);
      this.adaptIndex = 1 - this.adaptIndex;
      this._adaptPrimed = true;
      this._adaptedTex = next.texture;
    } else {
      this._adaptedTex = null;
    }

    // ---- 8. composite (tonemap + grade + grain) ----
    {
      const c = this.compositePass;
      c.set('uColor', src.texture).set('uBloom', bloomTex).set('uDepth', depthTex);
      c.set('uAdaptedLum', this._adaptedTex || this.blackTexture);
      c.set('uAutoExposure', this._adaptedTex ? this.autoExposure : 0);
      c.set('uKeyValue', this.keyValue);
      c.uniforms.uResolution.value.set(this.bufW, this.bufH);
      c.set('uTime', (this.frame % 4096) * 0.017);
      c.set('uExposure', this.exposure).set('uBloomStrength', this.bloomStrength);
      c.set('uChromatic', this.chromatic).set('uVignette', this.vignette);
      c.set('uGrain', this.grain).set('uSaturation', this.saturation).set('uContrast', this.contrast);
      c.uniforms.uLift.value.copy(this.lift);
      c.uniforms.uGamma.value.copy(this.gamma);
      c.uniforms.uGain.value.copy(this.gain);
      c.set('uDamage', this.damage).set('uFlash', this.flash);
      c.set('uNear', near).set('uFar', far);
      c.render(r, p.fxaa ? this.ldrRT : null);
    }

    // ---- 9. FXAA to the backbuffer ----
    if (p.fxaa) {
      this.fxaaPass.set('uColor', this.ldrRT.texture);
      this.fxaaPass.uniforms.uTexel.value.set(1 / this.bufW, 1 / this.bufH);
      this.fxaaPass.render(r, null);
    }

    r.setRenderTarget(null);
    this._prevViewProj.copy(this._curViewProj);
  }
}
