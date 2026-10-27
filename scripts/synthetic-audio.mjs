// Playwright-only media fixture. This function is injected into the isolated
// capture document by the smoke test; it is never included in application code.
export function installSyntheticAudio() {
  if (!location.pathname.endsWith("/audio.html")) return;
  const tracks = [];
  const counters = { microphone: 0, systemAudio: 0 };
  window.__everyhintSynthetic = { tracks, counters };
  async function create(source) {
    counters[source]++;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const destination = context.createMediaStreamDestination();
    const gain = context.createGain();
    gain.gain.value = source === "microphone" ? 0.2 : 0.5;
    oscillator.frequency.value = source === "microphone" ? 440 : 660;
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start();
    await context.resume();
    const stream = destination.stream;
    const track = stream.getAudioTracks()[0];
    track.getSettings = () => ({
      deviceId:
        source === "microphone" ? "synthetic-mic" : "synthetic-loopback",
      channelCount: 2,
      sampleRate: context.sampleRate,
    });
    Object.defineProperty(track, "label", {
      value:
        source === "microphone"
          ? "Synthetic microphone"
          : "Synthetic system audio",
    });
    tracks.push(track);
    if (source === "systemAudio") {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const video = canvas.captureStream(1).getVideoTracks()[0];
      stream.addTrack(video);
      tracks.push(video);
    }
    return stream;
  }
  navigator.mediaDevices.getUserMedia = () => create("microphone");
  navigator.mediaDevices.getDisplayMedia = () => create("systemAudio");
  navigator.mediaDevices.enumerateDevices = async () => [
    {
      kind: "audioinput",
      deviceId: "synthetic-mic",
      groupId: "synthetic-input",
      label: "Synthetic microphone",
    },
    {
      kind: "audiooutput",
      deviceId: "default",
      groupId: "synthetic-output",
      label: "Synthetic playback",
    },
  ];
}
