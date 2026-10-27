import type {
  AudioDiagnostic,
  AudioFrame,
  AudioPlan,
  AudioSourceId,
} from "../../shared/contracts";
import {
  AudioFrameBuffer,
  audioLevel,
  AUDIO_REPORT_INTERVAL_MS,
} from "../../shared/audio";
import { errorMessage } from "../../shared/validation";

interface Packet {
  startTimeSeconds?: number;
  samples: Float32Array;
  channels: number;
  sampleRate: number;
}
interface Input {
  stream: MediaStream;
  context: AudioContext;
  node: AudioWorkletNode;
  sourceNode: MediaStreamAudioSourceNode;
  buffer: AudioFrameBuffer;
  diagnostic: AudioDiagnostic;
  streamId: string;
  sequence: number;
  cleanupListeners: () => void;
  lastPacketAt: number;
  deviceGroup: string;
  clockOrigin: number | null;
}
export interface AudioEnvironment {
  devices: Pick<
    MediaDevices,
    | "getUserMedia"
    | "getDisplayMedia"
    | "enumerateDevices"
    | "addEventListener"
    | "removeEventListener"
  >;
  createContext(): AudioContext;
  createNode(context: AudioContext): AudioWorkletNode;
  workletUrl: string;
}
export class BrowserAudioCapture {
  private inputs = new Map<AudioSourceId, Input>();
  private pendingStreams = new Set<MediaStream>();
  private pendingContexts = new Set<AudioContext>();
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private outputSignature = "";
  private deviceCheckBusy = false;
  private live = false;
  constructor(
    private readonly environment: AudioEnvironment,
    private readonly report: (sources: AudioDiagnostic[]) => void,
    private readonly failure: (message: string, source?: AudioSourceId) => void,
    private readonly onFrame: (frame: AudioFrame) => void = () => {},
  ) {}
  async start(plan: AudioPlan): Promise<void> {
    this.stop();
    this.live = true;
    const generation = this.generation;
    const attempts: Promise<void>[] = [];
    if (plan.microphone)
      attempts.push(
        this.acquire(
          "microphone",
          this.environment.devices.getUserMedia({
            video: false,
            audio: {
              deviceId:
                plan.microphoneDeviceId === "default"
                  ? { ideal: "default" }
                  : { exact: plan.microphoneDeviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
              channelCount: { ideal: 1 },
            },
          }),
          generation,
          plan.microphoneDeviceId,
          plan.microphoneMuted,
        ),
      );
    if (plan.systemAudio)
      attempts.push(
        this.acquire(
          "systemAudio",
          this.environment.devices.getDisplayMedia({
            video: { frameRate: 1, width: 16, height: 16 },
            audio: true,
          }),
          generation,
        ),
      );
    const results = await Promise.allSettled(attempts);
    if (!this.current(generation)) return;
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      this.fail(errorMessage(failed.reason));
      return;
    }
    try {
      const devices = await this.environment.devices.enumerateDevices();
      if (!this.current(generation)) return;
      this.outputSignature = this.outputs(devices);
      const microphone = this.inputs.get("microphone");
      if (microphone)
        microphone.deviceGroup =
          devices.find(
            (device) =>
              device.kind === "audioinput" &&
              device.deviceId === microphone.diagnostic.deviceId,
          )?.groupId ?? microphone.deviceGroup;
      this.environment.devices.addEventListener(
        "devicechange",
        this.deviceChanged,
      );
      this.timer = setInterval(() => this.publish(), AUDIO_REPORT_INTERVAL_MS);
      this.publish();
    } catch (error) {
      if (this.current(generation)) this.fail(errorMessage(error));
    }
  }
  private current(generation: number): boolean {
    return this.live && this.generation === generation;
  }
  private async acquire(
    source: AudioSourceId,
    pending: Promise<MediaStream>,
    generation: number,
    requestedDevice?: string,
    muted = false,
  ): Promise<void> {
    let stream: MediaStream | undefined, context: AudioContext | undefined;
    let node: AudioWorkletNode | undefined,
      sourceNode: MediaStreamAudioSourceNode | undefined;
    try {
      stream = await pending;
      if (!this.current(generation)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.pendingStreams.add(stream);
      // Release Chromium's accompanying display track immediately. It is never
      // attached to video/canvas or the independent screen-analysis pipeline.
      stream.getVideoTracks().forEach((track) => {
        track.stop();
        stream!.removeTrack(track);
      });
      const tracks = stream.getAudioTracks();
      if (tracks.length !== 1 || tracks[0]!.readyState !== "live")
        throw new Error(
          source === "systemAudio"
            ? "Windows returned no live loopback audio. Check output playback and Windows audio permissions."
            : "The microphone is unavailable. Check Windows microphone privacy settings and allow desktop apps.",
        );
      const track = tracks[0]!;
      if (source === "microphone") track.enabled = !muted;
      if (
        requestedDevice &&
        !["default", "communications"].includes(requestedDevice) &&
        track.getSettings().deviceId !== requestedDevice
      )
        throw new Error(
          "The requested microphone could not be selected. Refresh the device list.",
        );
      context = this.environment.createContext();
      this.pendingContexts.add(context);
      await context.audioWorklet.addModule(this.environment.workletUrl);
      if (!this.current(generation)) {
        stream.getTracks().forEach((item) => item.stop());
        if (context.state !== "closed") await context.close();
        return;
      }
      if (track.readyState !== "live")
        throw new Error(
          "The selected audio device disconnected during startup.",
        );
      node = this.environment.createNode(context);
      sourceNode = context.createMediaStreamSource(stream);
      sourceNode.connect(node);
      node.connect(context.destination);
      const input: Input = {
        stream,
        context,
        node,
        sourceNode,
        buffer: new AudioFrameBuffer(),
        streamId: crypto.randomUUID(),
        sequence: 0,
        cleanupListeners: () => {},
        lastPacketAt: Date.now(),
        deviceGroup: track.getSettings().groupId ?? "",
        clockOrigin: null,
        diagnostic: {
          source,
          state: "CAPTURING",
          name: (
            track.label ||
            (source === "microphone"
              ? "Microphone"
              : "Windows default playback")
          ).slice(0, 200),
          deviceId:
            source === "microphone"
              ? (track.getSettings().deviceId ?? requestedDevice ?? "default")
              : null,
          level: 0,
          muted: track.muted || !track.enabled,
          error: null,
        },
      };
      const mute = () => {
        input.diagnostic.muted = track.muted || !track.enabled;
        if (input.diagnostic.muted) {
          input.diagnostic.level = 0;
          input.buffer.clear();
        }
        this.publish();
      };
      const ended = () => {
        if (this.current(generation))
          this.fail(
            `${source === "microphone" ? "Microphone disconnected or permission was revoked" : "System audio ended or the playback device changed"}. Stop and prepare a new session.`,
            source,
          );
      };
      track.addEventListener("mute", mute);
      track.addEventListener("unmute", mute);
      track.addEventListener("ended", ended);
      const contextChanged = () => {
        if (this.current(generation) && context!.state !== "running")
          this.fail(
            "Audio processing was interrupted. Prepare a new session.",
            source,
          );
      };
      input.cleanupListeners = () => {
        track.removeEventListener("mute", mute);
        track.removeEventListener("unmute", mute);
        track.removeEventListener("ended", ended);
        context!.removeEventListener("statechange", contextChanged);
      };
      node.port.onmessage = (event: MessageEvent<Packet>) => {
        if (!this.current(generation)) return;
        try {
          const packet = event.data;
          if (
            !(packet.samples instanceof Float32Array) ||
            packet.samples.length > 8192 ||
            ![1, 2].includes(packet.channels) ||
            !Number.isFinite(packet.sampleRate) ||
            packet.sampleRate < 8000 ||
            packet.sampleRate > 192000
          )
            throw new Error("Invalid local audio packet.");
          const frame: AudioFrame = {
            source,
            streamId: input.streamId,
            sequence: input.sequence++,
            timestamp:
              Date.now() -
              ((packet.samples.length / packet.channels) * 1000) /
                packet.sampleRate,
            sampleRate: packet.sampleRate,
            channels: packet.channels,
            format: "f32-interleaved",
            lifecycle: "data",
            samples: packet.samples,
          };
          if (
            typeof packet.startTimeSeconds === "number" &&
            Number.isFinite(packet.startTimeSeconds)
          ) {
            input.clockOrigin ??=
              frame.timestamp - packet.startTimeSeconds * 1000;
            frame.timestamp =
              input.clockOrigin + packet.startTimeSeconds * 1000;
          }
          if (!input.diagnostic.muted) input.buffer.push(frame);
          this.onFrame(
            input.diagnostic.muted
              ? { ...frame, samples: new Float32Array(frame.samples.length) }
              : frame,
          );
          input.diagnostic.level = input.diagnostic.muted
            ? 0
            : audioLevel(packet.samples);
          input.lastPacketAt = Date.now();
        } catch (error) {
          this.fail(errorMessage(error), source);
        } finally {
          if (this.current(generation)) node!.port.postMessage("ack");
        }
      };
      node.onprocessorerror = () => {
        if (this.current(generation))
          this.fail("Local audio processing failed.", source);
      };
      this.inputs.set(source, input);
      this.pendingStreams.delete(stream);
      this.pendingContexts.delete(context);
      await context.resume();
      if (!this.current(generation)) return;
      if (context.state !== "running")
        throw new Error("Audio processing could not start.");
      context.addEventListener("statechange", contextChanged);
      this.publish();
    } catch (error) {
      if (this.inputs.get(source)?.stream !== stream) {
        stream?.getTracks().forEach((track) => track.stop());
        node?.disconnect();
        node?.port.close();
        sourceNode?.disconnect();
        if (context && context.state !== "closed") await context.close();
      }
      if (this.current(generation))
        this.fail(
          `${source === "microphone" ? "Microphone" : "System audio"}: ${errorMessage(error)}. Check Windows privacy settings, device access and other applications using the device.`,
          source,
        );
    } finally {
      if (stream) this.pendingStreams.delete(stream);
      if (context) this.pendingContexts.delete(context);
    }
  }
  setMicrophoneMuted(muted: boolean): void {
    const input = this.inputs.get("microphone");
    if (!input) return;
    for (const track of input.stream.getAudioTracks()) track.enabled = !muted;
    input.diagnostic.muted =
      muted || input.stream.getAudioTracks().some((track) => track.muted);
    input.diagnostic.level = 0;
    input.buffer.clear();
    this.publish();
  }
  private outputs(devices: MediaDeviceInfo[]): string {
    return devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => `${device.deviceId}:${device.groupId}`)
      .sort()
      .join("|");
  }
  private readonly deviceChanged = (): void => {
    if (this.deviceCheckBusy || !this.live) return;
    this.deviceCheckBusy = true;
    const generation = this.generation;
    void this.environment.devices
      .enumerateDevices()
      .then((devices) => {
        if (!this.current(generation)) return;
        const microphone = this.inputs.get("microphone");
        const selected =
          microphone &&
          devices.find(
            (device) =>
              device.kind === "audioinput" &&
              device.deviceId === microphone.diagnostic.deviceId,
          );
        if (
          microphone &&
          (!selected || selected.groupId !== microphone.deviceGroup)
        ) {
          this.fail(
            "The selected microphone disconnected or changed. Refresh devices and prepare again.",
            "microphone",
          );
          return;
        }
        if (
          this.inputs.has("systemAudio") &&
          this.outputs(devices) !== this.outputSignature
        )
          this.fail(
            "Windows playback devices changed. Prepare system audio again.",
            "systemAudio",
          );
      })
      .catch((error: unknown) => {
        if (this.current(generation))
          this.fail(`Audio device check failed: ${errorMessage(error)}`);
      })
      .finally(() => {
        this.deviceCheckBusy = false;
      });
  };
  private publish(): void {
    if (this.live)
      this.report(
        [...this.inputs.values()].map((input) => ({
          ...input.diagnostic,
          level:
            Date.now() - input.lastPacketAt > 600 ? 0 : input.diagnostic.level,
        })),
      );
  }
  private fail(message: string, source?: AudioSourceId): void {
    this.stop();
    this.failure(message, source);
  }
  stop(): void {
    this.live = false;
    ++this.generation;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.environment.devices.removeEventListener(
      "devicechange",
      this.deviceChanged,
    );
    for (const stream of this.pendingStreams)
      stream.getTracks().forEach((track) => track.stop());
    for (const context of this.pendingContexts)
      if (context.state !== "closed")
        void context
          .close()
          .catch((error: unknown) =>
            this.failure(
              `Pending audio cleanup failed: ${errorMessage(error)}`,
            ),
          );
    this.pendingStreams.clear();
    this.pendingContexts.clear();
    for (const input of this.inputs.values()) {
      input.cleanupListeners();
      input.node.port.onmessage = null;
      input.node.onprocessorerror = null;
      input.stream.getTracks().forEach((track) => track.stop());
      input.sourceNode.disconnect();
      input.node.disconnect();
      input.node.port.close();
      input.buffer.clear();
      input.diagnostic.level = 0;
      if (input.context.state !== "closed")
        void input.context
          .close()
          .catch((error: unknown) =>
            this.failure(
              `Audio resource cleanup failed: ${errorMessage(error)}`,
            ),
          );
    }
    this.inputs.clear();
  }
}
