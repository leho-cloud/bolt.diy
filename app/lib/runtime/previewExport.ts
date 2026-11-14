type RegionCaptureTrack = MediaStreamTrack & { cropTo?: (target: unknown) => Promise<void> };
type CaptureWindow = Window & { CropTarget?: { fromElement: (element: Element) => Promise<unknown> } };
type CaptureOptions = DisplayMediaStreamOptions & { preferCurrentTab: boolean; surfaceSwitching: 'exclude' };

export function getPreviewMp4MimeType() {
  return ['video/mp4;codecs=avc1', 'video/mp4'].find((format) => globalThis.MediaRecorder?.isTypeSupported(format));
}

export async function openPreviewCapture() {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="preview"]');
  const cropTarget = (window as CaptureWindow).CropTarget;

  if (!frame?.getBoundingClientRect().width || !frame.getBoundingClientRect().height) {
    throw new Error('Nyisd meg az Előnézetet a mentéshez.');
  }

  if (!cropTarget || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Az előnézet médiaexportja asztali Chrome-ban érhető el.');
  }

  const options: CaptureOptions = {
    video: { frameRate: { ideal: 30 } },
    audio: false,
    preferCurrentTab: true,
    surfaceSwitching: 'exclude',
  };

  const stream = await navigator.mediaDevices.getDisplayMedia(options);

  try {
    const [track] = stream.getVideoTracks() as RegionCaptureTrack[];

    if (!track?.cropTo || track.getSettings().displaySurface !== 'browser') {
      throw new Error('A megosztásnál a jelenlegi Bolt lapot válaszd.');
    }

    await track.cropTo(await cropTarget.fromElement(frame));

    return stream;
  } catch {
    for (const track of stream.getTracks()) {
      track.stop();
    }

    throw new Error('A megosztásnál a jelenlegi Bolt lapot válaszd.');
  }
}

export async function capturePreviewImage(stream: MediaStream, mimeType: 'image/png' | 'image/jpeg') {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      video.play(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Az előnézetből nem érkezett kép.')), 5000);
      }),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');

    if (!canvas.width || !canvas.height || !context) {
      throw new Error('Az előnézetből nem érkezett kép.');
    }

    context.drawImage(video, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob?.type === mimeType) {
            resolve(blob);
          } else {
            reject(new Error('A képfájlt nem sikerült létrehozni.'));
          }
        },
        mimeType,
        0.95,
      );
    });
  } finally {
    clearTimeout(timeout);
    video.pause();
    video.srcObject = null;
  }
}
