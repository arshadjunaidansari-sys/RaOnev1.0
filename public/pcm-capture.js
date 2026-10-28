/* Mono PCM16 capture. Bucket resampling carries phase across worklet blocks. */
class RaonePCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.total = 0;
    this.count = 0;
    this.samples = [];
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.total += channel[i];
      this.count++;
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        const value = Math.max(-1, Math.min(1, this.total / this.count));
        this.samples.push(Math.round(value < 0 ? value * 32768 : value * 32767));
        this.total = 0;
        this.count = 0;
        if (this.samples.length === 320) {
          const buffer = new ArrayBuffer(640);
          const view = new DataView(buffer);
          for (let j = 0; j < 320; j++) view.setInt16(j * 2, this.samples[j], true);
          this.port.postMessage(buffer, [buffer]);
          this.samples = [];
        }
      }
    }
    return true;
  }
}
registerProcessor("raone-pcm", RaonePCM);
