/**
 * Web MIDI bridge for Roland MC-707.
 * Clock (F8), Start (FA), Stop (FC), CC FILTER/MOD/FX, volume CC7, Program Change.
 */
export class MidiBridge {
  constructor() {
    this.access = null;
    this.inputs = [];
    this.outputs = [];
    this.inPort = null;
    this.outPort = null;
    this.clockMaster = true; // app sends clock
    this.trackChannel = 0; // 0–7 → MIDI ch 1–8
    this.onClock = null; // () => void each F8
    this.onStart = null;
    this.onStop = null;
    this.onStatus = null;
    this.onPorts = null;

    this._clockTimer = null;
    this._bpm = 120;
    this._sending = false;
    this._extTicks = [];
    this.externalBpm = null;
  }

  async connect() {
    if (!navigator.requestMIDIAccess) {
      this._status('MIDI tylko na komputerze / natywna app później; audio+decki działają na telefonie');
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this._status('Brak dostępu MIDI: ' + e.message);
      return false;
    }
    this.access.onstatechange = () => this._refreshPorts();
    this._refreshPorts();
    this._prefer707();
    this._status(this.inputs.length || this.outputs.length
      ? `MIDI OK · in:${this.inputs.length} out:${this.outputs.length}`
      : 'MIDI OK · brak urządzeń — podłącz MC-707 USB');
    return true;
  }

  _refreshPorts() {
    this.inputs = [];
    this.outputs = [];
    if (!this.access) return;
    this.access.inputs.forEach((p) => this.inputs.push(p));
    this.access.outputs.forEach((p) => this.outputs.push(p));
    if (this.onPorts) this.onPorts({ inputs: this.inputs, outputs: this.outputs });
  }

  _prefer707() {
    const match = (name) => /mc-?707|roland/i.test(name || '');
    const prefIn = this.inputs.find((p) => match(p.name));
    const prefOut = this.outputs.find((p) => match(p.name));
    if (prefIn) this.setInput(prefIn.id);
    else if (this.inputs[0]) this.setInput(this.inputs[0].id);
    if (prefOut) this.setOutput(prefOut.id);
    else if (this.outputs[0]) this.setOutput(this.outputs[0].id);
  }

  setInput(id) {
    if (this.inPort) this.inPort.onmidimessage = null;
    this.inPort = this.inputs.find((p) => p.id === id) || null;
    if (this.inPort) {
      this.inPort.onmidimessage = (e) => this._onMessage(e);
      this._status(`IN: ${this.inPort.name}`);
    }
  }

  setOutput(id) {
    this.outPort = this.outputs.find((p) => p.id === id) || null;
    if (this.outPort) this._status(`OUT: ${this.outPort.name}`);
  }

  setClockMaster(isMaster) {
    this.clockMaster = !!isMaster;
    if (this.clockMaster) {
      this.externalBpm = null;
      if (this._sending) this.startClock(this._bpm);
    } else {
      this.stopClockSend();
    }
  }

  setTrackChannel(ch0to7) {
    this.trackChannel = Math.max(0, Math.min(7, ch0to7 | 0));
  }

  /** CC helpers — MC-707 style mapping (common defaults) */
  sendCC(cc, value, channel = this.trackChannel) {
    if (!this.outPort) return;
    const v = Math.max(0, Math.min(127, value | 0));
    this.outPort.send([0xb0 | (channel & 0x0f), cc & 0x7f, v]);
  }

  sendFilter(v0to1) { this.sendCC(80, Math.round(v0to1 * 127)); }
  sendMod(v0to1) { this.sendCC(81, Math.round(v0to1 * 127)); }
  sendFx(v0to1) { this.sendCC(82, Math.round(v0to1 * 127)); }
  sendVolume(v0to1) { this.sendCC(7, Math.round(v0to1 * 127)); }

  sendProgramChange(program, channel = this.trackChannel) {
    if (!this.outPort) return;
    this.outPort.send([0xc0 | (channel & 0x0f), program & 0x7f]);
  }

  sendStart() {
    if (this.outPort) this.outPort.send([0xfa]);
  }
  _native() { return !!(this.access && this.access.__native && window.DBotNative); }
  sendStop() {
    if (this.outPort) this.outPort.send([0xfc]);
  }
  sendContinue() {
    if (this.outPort) this.outPort.send([0xfb]);
  }

  startClock(bpm) {
    this._bpm = bpm || 120;
    this._sending = true;
    this.stopClockSend();
    if (!this.clockMaster || !this.outPort) return;
    if (this._native()) { window.DBotNative.MIDI.clockStart(this.outPort.id, this._bpm, true); this._nativeClock = true; return; } // v45 APK: native high-priority clock
    // 24 PPQN
    const intervalMs = (60 / this._bpm / 24) * 1000;
    this.sendStart();
    this._clockTimer = setInterval(() => {
      if (this.outPort && this.clockMaster) this.outPort.send([0xf8]);
    }, intervalMs);
  }

  updateClockBpm(bpm) {
    this._bpm = bpm;
    if (this._nativeClock) { window.DBotNative.MIDI.clockBpm(bpm); return; } // follow pitch without restarting (no extra Start)
    if (this._sending && this.clockMaster) this.startClock(bpm);
  }

  stopClockSend() {
    if (this._nativeClock) { window.DBotNative.MIDI.clockStop(false); this._nativeClock = false; }
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
  }

  stopTransport() {
    this.stopClockSend();
    this._sending = false;
    this.sendStop();
  }

  _onMessage(e) {
    const data = e.data;
    if (!data || !data.length) return;
    const status = data[0];

    if (status === 0xf8) {
      if (e.dbotBpm != null) { if (!this.clockMaster && e.dbotBpm > 40 && e.dbotBpm < 250) this.externalBpm = Math.round(e.dbotBpm * 10) / 10; if (this.onClock) this.onClock(); return; } // v45 native slave BPM
      // external clock tick
      if (!this.clockMaster) {
        const now = performance.now();
        this._extTicks.push(now);
        if (this._extTicks.length > 48) this._extTicks.shift();
        if (this._extTicks.length >= 24) {
          const dt = (this._extTicks[this._extTicks.length - 1] - this._extTicks[0]) / (this._extTicks.length - 1);
          // 24 ticks = 1 beat
          const bpm = 60000 / (dt * 24);
          if (bpm > 40 && bpm < 250) this.externalBpm = Math.round(bpm * 10) / 10;
        }
        if (this.onClock) this.onClock();
      }
      return;
    }
    if (status === 0xfa) {
      if (this.onStart) this.onStart();
      return;
    }
    if (status === 0xfc) {
      if (this.onStop) this.onStop();
      return;
    }
  }

  _status(msg) {
    if (this.onStatus) this.onStatus(msg);
  }
}
