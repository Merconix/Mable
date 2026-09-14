// HTMLAudioElement.play() registers a media session (lock screen / media keys)
// and, in WKWebView, runs on the .playback audio session category, which uses
// media volume and interrupts whatever the user is listening to. A Web Audio
// buffer source does neither.

let context: AudioContext | undefined;
let playingSource: AudioBufferSourceNode | undefined;
const buffers = new Map<string, Promise<AudioBuffer>>();

const decode = (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
  const cached = buffers.get(url);
  if (cached) return cached;

  const buffer = fetch(url)
    .then((response) => response.arrayBuffer())
    .then((bytes) => ctx.decodeAudioData(bytes))
    .catch((error) => {
      buffers.delete(url);
      throw error;
    });
  buffers.set(url, buffer);
  return buffer;
};

const resetAudioState = (
  failedContext: AudioContext,
  failedSource?: AudioBufferSourceNode
): void => {
  if (context === failedContext) {
    context = undefined;
    playingSource = undefined;
    buffers.clear();
  }
  failedSource?.disconnect();
  if (failedContext.state !== 'closed') {
    void failedContext.close().catch(() => {});
  }
};

export const playNotificationSound = async (url: string): Promise<void> => {
  const audioContext = (context ??= new AudioContext());
  const buffer = await decode(audioContext, url);
  let source: AudioBufferSourceNode | undefined;
  try {
    if (context !== audioContext) return;
    if (audioContext.state !== 'running') {
      await audioContext.resume();
      if (context !== audioContext) return;
    }
    if (playingSource) return;
    source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    playingSource = source;
    source.addEventListener(
      'ended',
      () => {
        if (playingSource === source) playingSource = undefined;
      },
      { once: true }
    );
    source.start();
  } catch (error) {
    resetAudioState(audioContext, source);
    throw error;
  }
};
