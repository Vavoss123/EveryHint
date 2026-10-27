import { AudioPacketAccumulator } from "../../shared/audio";
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor,
): void;
class EveryHintPCM extends AudioWorkletProcessor {
  private readonly packets = new AudioPacketAccumulator();
  constructor() {
    super();
    this.port.onmessage = () => this.packets.acknowledge();
  }
  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0] ?? [];
    const packet = this.packets.accept(channels);
    if (packet)
      this.port.postMessage(
        { samples: packet, channels: Math.min(2, channels.length), sampleRate },
        [packet.buffer],
      );
    // Leave output zero-filled; never play captured conversations to speakers.
    return true;
  }
}
registerProcessor("everyhint-pcm", EveryHintPCM);
