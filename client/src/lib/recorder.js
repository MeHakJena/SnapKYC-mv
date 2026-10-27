// Records the call on the agent's side.
// Video: the customer full-frame with the agent in a small corner, drawn onto a canvas.
// Audio: both voices mixed together. Output is a WebM (or MP4 on Safari) file.

function pickMimeType() {
  const options = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

function drawCover(ctx, video, x, y, w, h) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
}

export function startRecording({ remoteVideo, localVideo, remoteStream, localStream, label }) {
  if (!window.MediaRecorder) throw new Error('This browser cannot record video');

  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');

  const draw = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 960, 540);
    drawCover(ctx, remoteVideo, 0, 0, 960, 540);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    drawCover(ctx, localVideo, 960 - 232, 540 - 142, 216, 126);
    ctx.strokeRect(960 - 232, 540 - 142, 216, 126);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(12, 12, 430, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    ctx.fillText(`${label} · ${new Date().toLocaleString()}`, 22, 32);
  };
  const timer = setInterval(draw, 1000 / 15);

  const audioCtx = new AudioContext();
  audioCtx.resume().catch(() => {});
  const mix = audioCtx.createMediaStreamDestination();
  for (const s of [remoteStream, localStream]) {
    if (s?.getAudioTracks().length) audioCtx.createMediaStreamSource(s).connect(mix);
  }

  const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...mix.stream.getAudioTracks()]);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), videoBitsPerSecond: 600_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.start(1000);
  const startedAt = Date.now();

  return {
    startedAt,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          clearInterval(timer);
          stream.getTracks().forEach((t) => t.stop());
          audioCtx.close().catch(() => {});
          const type = recorder.mimeType || mimeType || 'video/webm';
          resolve({ blob: new Blob(chunks, { type }), durationSec: Math.round((Date.now() - startedAt) / 1000) });
        };
        recorder.stop();
      }),
  };
}

// A still JPEG of the customer's face from the live video.
export function captureSnapshot(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (!canvas.width) return Promise.reject(new Error('Video is not showing yet'));
  canvas.getContext('2d').drawImage(video, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}
