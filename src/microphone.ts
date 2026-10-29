type Level = { value: number; measured: boolean };

export function monitorMicrophone(
  stream: MediaStream,
  onLevel: (level: Level) => void,
) {
  const Audio =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Audio) return null;
  let context: AudioContext | null = null;
  try {
    context = new Audio();
    const audio = context,
      source = audio.createMediaStreamSource(stream),
      analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const values = new Float32Array(analyser.fftSize);
    let samples = 0,
      peak = 0,
      stopped = false;
    function sample() {
      if (stopped || audio.state !== "running") return;
      try {
        analyser.getFloatTimeDomainData(values);
        let sum = 0,
          squares = 0;
        for (const value of values) {
          sum += value;
          squares += value * value;
        }
        // Remove DC offset; an offset is not an audible microphone signal.
        const rms = Math.sqrt(
          Math.max(0, squares / values.length - (sum / values.length) ** 2),
        );
        samples++;
        peak = Math.max(peak, rms);
        onLevel({ value: rms, measured: true });
      } catch {
        // Missing analysis must never prevent an otherwise valid recording.
        onLevel({ value: 0, measured: false });
      }
    }
    const timer = setInterval(sample, 100);
    void audio.resume().catch(() => {});
    return {
      stop() {
        if (stopped) return { samples, peak };
        sample();
        stopped = true;
        clearInterval(timer);
        source.disconnect();
        analyser.disconnect();
        void audio.close().catch(() => {});
        return { samples, peak };
      },
    };
  } catch {
    if (context) void context.close().catch(() => {});
    return null;
  }
}
