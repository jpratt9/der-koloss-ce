// Net's voice chat, end to end: the microphone, the full-mesh calls, the audio
// elements, the analysers and the mutes.
// Methods of Net: js/net.js copies them onto Net.prototype.
import { audio } from '../audio.js';
import { PREFIX } from './identity.js';

export class NetVoice {
  _cleanupPeerVoice(id) {
    this._detachVoiceStream(id);
    this._mediaPeers?.delete(id);
    this.mutedPeers.delete(id);
    const media = this._mediaConnections.get(id);
    this._mediaConnections.delete(id);
    try { media?.close(); } catch (e) {}
  }

  // ---------------- voice chat (PeerJS media) ----------------
  _setupVoiceAnswer() {
    // answer incoming calls whether or not we've enabled our own mic yet
    if (this._voiceAnswerWired || !this.peer) return;
    this._voiceAnswerWired = true;
    this.peer.on('call', (mc) => {
      if (!this._isAllowedVoicePeer(mc.peer)) { try { mc.close(); } catch (e) {} return; }
      // Wait briefly for the lobby's normal microphone request to finish so a
      // single PeerJS call carries audio both ways instead of spawning a second
      // connection for the reverse direction.
      const started = performance.now();
      const generation = this._voiceRequestGeneration;
      const answer = () => {
        if (generation !== this._voiceRequestGeneration || !this._isAllowedVoicePeer(mc.peer)) {
          try { mc.close(); } catch (e) {}
          return;
        }
        if (!this.myStream && !this.voiceFailed && performance.now() - started < 8000) {
          setTimeout(answer, 100);
          return;
        }
        try { mc.answer(this.myStream || undefined); } catch (e) { try { mc.answer(); } catch (e2) {} }
        this._wireMediaConn(mc);
      };
      answer();
    });
  }

  _isAllowedVoicePeer(id) {
    if (!this.lobbyVoiceEnabled || !id || id === this.myId) return false;
    if (this.isHost) {
      const peer = this.peers.get(id);
      return !!(peer?.authenticated && peer.r?.open && this.lobbyPlayers.some((p) => p.id === id));
    }
    if (!this.hostConn?.r?.open) return false;
    if (id === PREFIX + this.code) return true;
    return this.lobbyPlayers.some((p) => p.id === id);
  }

  async enableVoice() {
    if (!this.lobbyVoiceEnabled || this.myStream || this.voiceFailed) return this.myStream;
    if (this._enableVoicePromise) return this._enableVoicePromise;
    const requestGeneration = this._voiceRequestGeneration;
    this._enableVoicePromise = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
        } });
        if (!this.lobbyVoiceEnabled || requestGeneration !== this._voiceRequestGeneration) {
          for (const track of stream.getTracks()) track.stop();
          return null;
        }
        for (const track of stream.getAudioTracks()) track.contentHint = 'speech';
        this.myStream = stream;
        this._mediaPeers = this._mediaPeers || new Set();
        // self-level analyser (lobby + HUD "you are talking" indicator)
        try {
          audio.init();
          const src = audio.ctx.createMediaStreamSource(stream);
          this._myAnalyser = audio.ctx.createAnalyser();
          this._myAnalyser.fftSize = 512;
          src.connect(this._myAnalyser);
          this._myData = new Uint8Array(this._myAnalyser.frequencyBinCount);
        } catch (e) {}
        if (this.micMuted) this.setMicMuted(true); // re-apply a lobby mute to the fresh stream
        // call everyone in the lobby (host: peer map; guests: lobby player ids)
        const ids = new Set(this.isHost ? [...this.peers.keys()] : this.lobbyPlayers.map((l) => l.id));
        ids.delete(this.myId);
        for (const id of ids) if (this._shouldCall(id)) this._callPeer(id);
        this._setupVoiceAnswer();
        return stream;
      } catch (e) {
        if (this.lobbyVoiceEnabled && requestGeneration === this._voiceRequestGeneration) this.voiceFailed = true;
        return null;
      }
    })();
    try { return await this._enableVoicePromise; }
    finally { this._enableVoicePromise = null; }
  }

  // call any lobby members we don't have media with yet (e.g. someone joined late)
  syncVoiceCalls() {
    if (!this.lobbyVoiceEnabled || !this.myStream) return;
    this._mediaPeers = this._mediaPeers || new Set();
    for (const l of this.lobbyPlayers) {
      if (l.id !== this.myId && this._shouldCall(l.id) && !this._mediaPeers.has(l.id)) this._callPeer(l.id);
    }
  }

  _shouldCall(id) { return String(this.myId || '').localeCompare(String(id || '')) < 0; }

  _callPeer(id) {
    if (!this.myStream || !this._isAllowedVoicePeer(id)) return;
    this._mediaPeers = this._mediaPeers || new Set();
    if (this._mediaPeers.has(id)) return;
    this._mediaPeers.add(id);
    try {
      const mc = this.peer.call(id, this.myStream);
      this._wireMediaConn(mc);
    } catch (e) { this._mediaPeers.delete(id); }
  }

  _wireMediaConn(mc) {
    if (!mc || !this._isAllowedVoicePeer(mc.peer)) { try { mc?.close(); } catch (e) {} return; }
    this._mediaPeers = this._mediaPeers || new Set();
    this._mediaPeers.add(mc.peer);
    const previous = this._mediaConnections.get(mc.peer);
    this._mediaConnections.set(mc.peer, mc);
    if (previous && previous !== mc) { try { previous.close(); } catch (e) {} }
    mc.on('stream', (remote) => {
      if (this._mediaConnections.get(mc.peer) !== mc || !this._isAllowedVoicePeer(mc.peer)) return;
      this._attachVoiceStream(mc.peer, remote);
      this.onVoiceStream?.(mc.peer, remote);
    });
    const cleanup = () => {
      // An old call may close after OFF -> ON has installed a replacement. It
      // must not delete/detach the replacement's state.
      if (this._mediaConnections.get(mc.peer) !== mc) return;
      this._mediaConnections.delete(mc.peer);
      this._mediaPeers?.delete(mc.peer);
      this._detachVoiceStream(mc.peer);
      this.onVoiceStreamEnd?.(mc.peer);
    };
    mc.on('close', cleanup);
    mc.on('error', cleanup);
  }

  // ---------------- voice streams (shared by lobby UI + game HUD) ----------------
  _attachVoiceStream(id, stream) {
    if (this.voiceStreams.has(id)) return;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.playsInline = true;
    el.srcObject = stream;
    el.muted = this.mutedPeers.has(id);
    el.volume = this.voiceVolume;
    document.body.appendChild(el);
    let analyser = null, data = null;
    try {
      audio.init();
      const srcNode = audio.ctx.createMediaStreamSource(stream);
      analyser = audio.ctx.createAnalyser();
      analyser.fftSize = 512;
      srcNode.connect(analyser); // analysis only — playback stays on the <audio> el
      data = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {}
    this.voiceStreams.set(id, { el, analyser, data, speaking: false });
  }

  _detachVoiceStream(id) {
    const vs = this.voiceStreams.get(id);
    if (!vs) return;
    try { vs.el.srcObject = null; vs.el.remove(); } catch (e) {}
    this.voiceStreams.delete(id);
  }

  _detachAllVoice() { for (const id of [...this.voiceStreams.keys()]) this._detachVoiceStream(id); }

  mutePeer(id, m) {
    if (m) this.mutedPeers.add(id); else this.mutedPeers.delete(id);
    const vs = this.voiceStreams.get(id);
    if (vs) { try { vs.el.muted = m; } catch (e) {} }
  }

  // call every frame (game) or on a timer (lobby): updates speaking flags + ducking
  updateVoiceSpeaking() {
    const now = performance.now();
    if (now < (this._nextVoiceMeter || 0)) return;
    this._nextVoiceMeter = now + 50;
    if (this._myAnalyser) {
      this._myAnalyser.getByteTimeDomainData(this._myData);
      let peak = 0;
      for (const v of this._myData) peak = Math.max(peak, Math.abs(v - 128));
      this.mySpeaking = peak > 14 && !this.micMuted;
    } else this.mySpeaking = false;
    let active = 0;
    for (const [, vs] of this.voiceStreams) {
      if (!vs.analyser) { vs.speaking = false; continue; }
      vs.analyser.getByteTimeDomainData(vs.data);
      let peak = 0;
      for (const v of vs.data) peak = Math.max(peak, Math.abs(v - 128));
      vs.speaking = peak > 14;
      if (vs.speaking) active++;
    }
    // smart voice management: when 3+ people talk over each other, duck them all
    for (const [, vs] of this.voiceStreams) { try { vs.el.volume = this.voiceVolume * (active >= 3 ? 0.65 : 1.0); } catch (e) {} }
  }

  setVoiceVolume(value) {
    this.voiceVolume = Math.max(0, Math.min(1, Number(value) || 0));
    for (const [, vs] of this.voiceStreams) { try { vs.el.volume = this.voiceVolume; } catch (e) {} }
  }

  setMicMuted(muted) {
    this.micMuted = muted;
    if (!this.myStream) return;
    for (const tr of this.myStream.getAudioTracks()) tr.enabled = !muted;
  }

  disableVoice() {
    this._voiceRequestGeneration++;
    try { this.myStream?.getTracks().forEach((t) => t.stop()); } catch (e) {}
    this.myStream = null;
    this._myAnalyser = null;
    this._myData = null;
    this.mySpeaking = false;
    const calls = [...this._mediaConnections.values()];
    this._mediaConnections.clear();
    this._mediaPeers?.clear();
    for (const call of calls) { try { call.close(); } catch (e) {} }
    this._detachAllVoice();
  }
}
