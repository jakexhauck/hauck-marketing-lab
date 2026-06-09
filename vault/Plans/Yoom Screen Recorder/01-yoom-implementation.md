---
type: plan
title: "Yoom Implementation Plan"
status: draft
tags: [plan, feature]
plan_kind: feature
created: "2026-05-24T14:32:21.000Z"
source: "docs/build-plans/Yoom Screen Recorder/01-yoom-implementation.md"
---

# Yoom Implementation Plan

> Source: adapted from `albertshiney/yoom_public` on GitHub. Personal screen recording tool that uploads to Cloudflare R2 and returns a shareable watch link. No database.

**Goal:** Build a personal screen recording tool that uploads to Cloudflare R2 and generates shareable watch links.

**Architecture:** Next.js 15 App Router with two pages (`/` for recording, `/watch/[key]` for playback) and one API route (`/api/upload`). Browser captures screen/camera via MediaRecorder, uploads directly to R2 via presigned URL. No database.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

---

## Prerequisites Jake handles first

1. Cloudflare account with R2 enabled
2. Create R2 bucket with public access on
3. Generate R2 API token with Object Read & Write
4. Grab Account ID from Cloudflare dashboard URL
5. Pick an upload password (strong, you'll type it once)

---

## File Structure

```
yoom/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout: dark mode, fonts
│   │   ├── page.tsx                # Record page: password gate + recorder
│   │   ├── watch/
│   │   │   └── [key]/
│   │   │       └── page.tsx        # Public video player
│   │   └── api/
│   │       ├── upload/
│   │       │   └── route.ts        # Presigned URL generation
│   │       └── auth/
│   │           └── route.ts        # Password validation
│   ├── components/
│   │   ├── password-gate.tsx       # Password input form
│   │   ├── recorder.tsx            # Main recorder UI (mode select, device select, controls)
│   │   ├── device-selector.tsx     # Mic/camera dropdown selector
│   │   ├── recording-preview.tsx   # Live preview + canvas compositing
│   │   └── video-player.tsx        # Watch page player component
│   └── lib/
│       └── r2.ts                   # R2 client setup + presigned URL helper
├── .env.example                    # Template for env vars
├── tailwind.config.ts
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Initialize Next.js 15 project**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Select defaults when prompted. This creates the full scaffolding.

- [ ] **Step 2: Install R2/S3 dependencies**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 3: Create `.env.example`**

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
UPLOAD_PASSWORD=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Create `.env.local` from example**

```bash
cp .env.example .env.local
```

Add `.env.local` to `.gitignore` if not already there.

- [ ] **Step 5: Update root layout for dark mode**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Yoom",
  description: "Screen recording with shareable links",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-neutral-950 text-neutral-100 min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Replace `src/app/page.tsx` with placeholder**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">Yoom</h1>
    </main>
  );
}
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```

Expected: app runs on `http://localhost:3000`, shows "Yoom" centered on dark background.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with Tailwind and R2 deps"
```

---

### Task 2: R2 Client & Upload API Route

**Files:**
- Create: `src/lib/r2.ts`, `src/app/api/upload/route.ts`

- [ ] **Step 1: Create R2 client helper**

Create `src/lib/r2.ts`:

```ts
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function createPresignedUploadUrl(key: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: "video/webm",
  });

  return getSignedUrl(r2, command, { expiresIn: 600 });
}

export async function videoExists(key: string): Promise<boolean> {
  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function getPublicVideoUrl(key: string): string {
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
```

- [ ] **Step 2: Create upload API route**

Create `src/app/api/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createPresignedUploadUrl } from "@/lib/r2";

export async function POST(request: NextRequest) {
  const password = request.headers.get("x-upload-password");

  if (!password || password !== process.env.UPLOAD_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = `${randomUUID()}.webm`;
  const presignedUrl = await createPresignedUploadUrl(key);

  return NextResponse.json({ presignedUrl, key });
}
```

- [ ] **Step 3: Test with curl (manual verification)**

Start the dev server and run:

```bash
curl -X POST http://localhost:3000/api/upload -H "x-upload-password: wrong" -v
```

Expected: 401 Unauthorized.

```bash
curl -X POST http://localhost:3000/api/upload -H "x-upload-password: YOUR_PASSWORD_HERE" -v
```

Expected: 200 with JSON `{ presignedUrl: "...", key: "xxx.webm" }`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/r2.ts src/app/api/upload/route.ts
git commit -m "feat: add R2 client and presigned upload API route"
```

---

### Task 3: Password Auth API Route & Gate Component

**Files:**
- Create: `src/app/api/auth/route.ts`, `src/components/password-gate.tsx`

- [ ] **Step 1: Create auth API route**

Create `src/app/api/auth/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!password || password !== process.env.UPLOAD_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Create password gate component**

Create `src/components/password-gate.tsx`:

```tsx
"use client";

import { useState } from "react";

interface PasswordGateProps {
  onAuthenticated: (password: string) => void;
}

export function PasswordGate({ onAuthenticated }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      onAuthenticated(password);
    } else {
      setError("Invalid password");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold text-center">Yoom</h1>
        <p className="text-sm text-neutral-400 text-center">
          Enter password to start recording
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-neutral-600 transition-colors"
          autoFocus
        />
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Checking..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Wire up the record page**

Update `src/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PasswordGate } from "@/components/password-gate";

export default function Home() {
  const [password, setPassword] = useState<string | null>(null);

  if (!password) {
    return <PasswordGate onAuthenticated={setPassword} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-neutral-400">Recorder goes here</p>
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Expected: visit `http://localhost:3000`, see password form. Wrong password shows error. Correct password shows "Recorder goes here".

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/route.ts src/components/password-gate.tsx src/app/page.tsx
git commit -m "feat: add password gate with auth API route"
```

---

### Task 4: Device Selector Component

**Files:**
- Create: `src/components/device-selector.tsx`

- [ ] **Step 1: Create device selector component**

Create `src/components/device-selector.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface DeviceSelectorProps {
  kind: "audioinput" | "videoinput";
  label: string;
  value: string;
  onChange: (deviceId: string) => void;
}

export function DeviceSelector({ kind, label, value, onChange }: DeviceSelectorProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    async function loadDevices() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          kind === "audioinput" ? { audio: true } : { video: true }
        );
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // Permission denied: devices will show without labels
      }

      const all = await navigator.mediaDevices.enumerateDevices();
      const filtered = all.filter((d) => d.kind === kind);
      setDevices(filtered);

      if (filtered.length > 0 && !value) {
        onChange(filtered[0].deviceId);
      }
    }

    loadDevices();
  }, [kind]);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600 transition-colors appearance-none cursor-pointer"
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${kind === "audioinput" ? "Microphone" : "Camera"} ${device.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/device-selector.tsx
git commit -m "feat: add device selector component for mic and camera"
```

---

### Task 5: Recording Preview & Canvas Compositing

**Files:**
- Create: `src/components/recording-preview.tsx`

- [ ] **Step 1: Create recording preview component**

Handles live preview and canvas compositing for Screen + Camera mode. Create `src/components/recording-preview.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

interface RecordingPreviewProps {
  mode: "screen" | "camera" | "screen+camera";
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function RecordingPreview({
  mode,
  screenStream,
  cameraStream,
  canvasRef,
}: RecordingPreviewProps) {
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => {
    if (mode !== "screen+camera" || !canvasRef.current || !screenStream || !cameraStream) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const screenVideo = screenVideoRef.current!;
    const cameraVideo = cameraVideoRef.current!;

    function draw() {
      if (!screenVideo.videoWidth) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      canvas.width = screenVideo.videoWidth;
      canvas.height = screenVideo.videoHeight;

      ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

      const camWidth = Math.round(canvas.width * 0.2);
      const camHeight = Math.round(
        camWidth * (cameraVideo.videoHeight / (cameraVideo.videoWidth || 1))
      );
      const padding = 20;
      const camX = canvas.width - camWidth - padding;
      const camY = canvas.height - camHeight - padding;

      const radius = 12;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(camX + radius, camY);
      ctx.lineTo(camX + camWidth - radius, camY);
      ctx.quadraticCurveTo(camX + camWidth, camY, camX + camWidth, camY + radius);
      ctx.lineTo(camX + camWidth, camY + camHeight - radius);
      ctx.quadraticCurveTo(camX + camWidth, camY + camHeight, camX + camWidth - radius, camY + camHeight);
      ctx.lineTo(camX + radius, camY + camHeight);
      ctx.quadraticCurveTo(camX, camY + camHeight, camX, camY + camHeight - radius);
      ctx.lineTo(camX, camY + radius);
      ctx.quadraticCurveTo(camX, camY, camX + radius, camY);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(cameraVideo, camX, camY, camWidth, camHeight);
      ctx.restore();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(camX + radius, camY);
      ctx.lineTo(camX + camWidth - radius, camY);
      ctx.quadraticCurveTo(camX + camWidth, camY, camX + camWidth, camY + radius);
      ctx.lineTo(camX + camWidth, camY + camHeight - radius);
      ctx.quadraticCurveTo(camX + camWidth, camY + camHeight, camX + camWidth - radius, camY + camHeight);
      ctx.lineTo(camX + radius, camY + camHeight);
      ctx.quadraticCurveTo(camX, camY + camHeight, camX, camY + camHeight - radius);
      ctx.lineTo(camX, camY + radius);
      ctx.quadraticCurveTo(camX, camY, camX + radius, camY);
      ctx.closePath();
      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [mode, screenStream, cameraStream, canvasRef]);

  return (
    <div className="relative w-full max-w-2xl aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800">
      {mode === "screen" && (
        <video
          ref={screenVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
        />
      )}

      {mode === "camera" && (
        <video
          ref={cameraVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain mirror"
          style={{ transform: "scaleX(-1)" }}
        />
      )}

      {mode === "screen+camera" && (
        <>
          <video ref={screenVideoRef} autoPlay muted playsInline className="hidden" />
          <video ref={cameraVideoRef} autoPlay muted playsInline className="hidden" />
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/recording-preview.tsx
git commit -m "feat: add recording preview with canvas compositing for screen+camera"
```

---

### Task 6: Main Recorder Component

**Files:**
- Create: `src/components/recorder.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the recorder component**

Create `src/components/recorder.tsx`:

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { DeviceSelector } from "./device-selector";
import { RecordingPreview } from "./recording-preview";

type RecordingMode = "screen" | "camera" | "screen+camera";
type RecorderState = "idle" | "recording" | "uploading" | "done";

interface RecorderProps {
  password: string;
}

export function Recorder({ password }: RecorderProps) {
  const [mode, setMode] = useState<RecordingMode>("screen");
  const [micId, setMicId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const stopAllStreams = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    setScreenStream(null);
    setCameraStream(null);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  async function startRecording() {
    setError("");
    chunksRef.current = [];

    try {
      let recordStream: MediaStream;

      if (mode === "screen" || mode === "screen+camera") {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = screen;
        setScreenStream(screen);

        screen.getVideoTracks()[0].addEventListener("ended", () => {
          stopRecording();
        });
      }

      if (mode === "camera" || mode === "screen+camera") {
        const camera = await navigator.mediaDevices.getUserMedia({
          video: cameraId ? { deviceId: { exact: cameraId } } : true,
          audio: mode === "camera" ? (micId ? { deviceId: { exact: micId } } : true) : false,
        });
        cameraStreamRef.current = camera;
        setCameraStream(camera);
      }

      if (mode === "screen") {
        recordStream = screenStreamRef.current!;
        if (micId) {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: micId } },
          });
          micStream.getAudioTracks().forEach((t) => recordStream.addTrack(t));
        }
      } else if (mode === "camera") {
        recordStream = cameraStreamRef.current!;
        if (micId) {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: micId } },
          });
          cameraStreamRef.current!.getAudioTracks().forEach((t) => t.stop());
          recordStream = new MediaStream([
            ...cameraStreamRef.current!.getVideoTracks(),
            ...micStream.getAudioTracks(),
          ]);
        }
      } else {
        const canvas = canvasRef.current!;
        await new Promise((r) => setTimeout(r, 200));
        const canvasStream = canvas.captureStream(30);

        if (micId) {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: micId } },
          });
          micStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
        } else if (screenStreamRef.current!.getAudioTracks().length > 0) {
          screenStreamRef.current!.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
        }

        recordStream = canvasStream;
      }

      const mediaRecorder = new MediaRecorder(recordStream, {
        mimeType: "video/webm;codecs=vp9",
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => handleRecordingComplete();

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setState("recording");

      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      stopAllStreams();
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Permission denied. Please allow screen/camera access.");
      } else {
        setError("Failed to start recording. Check your device permissions.");
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function handleRecordingComplete() {
    setState("uploading");
    stopAllStreams();

    const blob = new Blob(chunksRef.current, { type: "video/webm" });

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-upload-password": password },
      });

      if (!res.ok) throw new Error("Failed to get upload URL");

      const { presignedUrl, key } = await res.json();

      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presignedUrl);
      xhr.setRequestHeader("Content-Type", "video/webm");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(blob);
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      setShareUrl(`${appUrl}/watch/${key}`);
      setState("done");
    } catch {
      setError("Upload failed. Please try again.");
      setState("idle");
    }
  }

  function reset() {
    setState("idle");
    setShareUrl("");
    setElapsed(0);
    setUploadProgress(0);
    setError("");
    chunksRef.current = [];
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(shareUrl);
  }

  if (state === "done") {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="rounded-full w-12 h-12 bg-green-500/10 text-green-400 flex items-center justify-center mx-auto text-xl">
            ✓
          </div>
          <h2 className="text-xl font-semibold">Recording uploaded</h2>
          <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent text-sm text-neutral-300 outline-none truncate"
            />
            <button
              onClick={copyToClipboard}
              className="shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-neutral-200 transition-colors"
            >
              Copy
            </button>
          </div>
          <button
            onClick={reset}
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Record another
          </button>
        </div>
      </main>
    );
  }

  if (state === "uploading") {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4 text-center">
          <h2 className="text-xl font-semibold">Uploading...</h2>
          <div className="w-full rounded-full bg-neutral-800 h-2">
            <div
              className="h-2 rounded-full bg-white transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-neutral-400">{uploadProgress}%</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {state === "recording" && (
        <RecordingPreview
          mode={mode}
          screenStream={screenStream}
          cameraStream={cameraStream}
          canvasRef={canvasRef}
        />
      )}

      {mode === "screen+camera" && state !== "recording" && (
        <canvas ref={canvasRef} className="hidden" />
      )}

      <div className="w-full max-w-md space-y-6">
        {state === "idle" && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
                Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "screen", label: "Screen" },
                  { value: "camera", label: "Camera" },
                  { value: "screen+camera", label: "Screen + Cam" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMode(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      mode === opt.value
                        ? "border-white bg-white text-neutral-950"
                        : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <DeviceSelector
              kind="audioinput"
              label="Microphone"
              value={micId}
              onChange={setMicId}
            />
            {(mode === "camera" || mode === "screen+camera") && (
              <DeviceSelector
                kind="videoinput"
                label="Camera"
                value={cameraId}
                onChange={setCameraId}
              />
            )}
          </>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <div className="flex items-center justify-center gap-4">
          {state === "idle" && (
            <button
              onClick={startRecording}
              className="rounded-lg bg-red-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
            >
              Start Recording
            </button>
          )}

          {state === "recording" && (
            <>
              <span className="flex items-center gap-2 text-sm text-neutral-300">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                {formatTime(elapsed)}
              </span>
              <button
                onClick={stopRecording}
                className="rounded-lg border border-neutral-600 px-6 py-2.5 text-sm font-medium text-neutral-100 hover:bg-neutral-800 transition-colors"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Update the record page to use Recorder**

Update `src/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PasswordGate } from "@/components/password-gate";
import { Recorder } from "@/components/recorder";

export default function Home() {
  const [password, setPassword] = useState<string | null>(null);

  if (!password) {
    return <PasswordGate onAuthenticated={setPassword} />;
  }

  return <Recorder password={password} />;
}
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Expected: after password gate, see mode selector, device selectors, and Start Recording button. Clicking Start Recording opens browser screen/camera picker. During recording, see preview and timer. Stop button ends recording and triggers upload flow.

- [ ] **Step 4: Commit**

```bash
git add src/components/recorder.tsx src/app/page.tsx
git commit -m "feat: add recorder with mode selection, device pickers, and upload flow"
```

---

### Task 7: Watch Page

**Files:**
- Create: `src/components/video-player.tsx`, `src/app/watch/[key]/page.tsx`

- [ ] **Step 1: Create video player component**

Create `src/components/video-player.tsx`:

```tsx
"use client";

interface VideoPlayerProps {
  src: string;
  shareUrl: string;
}

export function VideoPlayer({ src, shareUrl }: VideoPlayerProps) {
  async function copyToClipboard() {
    await navigator.clipboard.writeText(shareUrl);
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      <video
        src={src}
        controls
        autoPlay
        className="w-full rounded-xl border border-neutral-800"
      />
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
          <span className="text-sm text-neutral-400 truncate block">{shareUrl}</span>
        </div>
        <button
          onClick={copyToClipboard}
          className="shrink-0 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
        >
          Copy link
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create watch page**

Create `src/app/watch/[key]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { videoExists, getPublicVideoUrl } from "@/lib/r2";
import { VideoPlayer } from "@/components/video-player";

interface WatchPageProps {
  params: Promise<{ key: string }>;
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { key } = await params;

  if (!/^[0-9a-f-]+\.webm$/.test(key)) {
    notFound();
  }

  const exists = await videoExists(key);
  if (!exists) {
    notFound();
  }

  const videoUrl = getPublicVideoUrl(key);
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/watch/${key}`;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <VideoPlayer src={videoUrl} shareUrl={shareUrl} />
    </main>
  );
}
```

- [ ] **Step 3: Create not-found page for watch route**

Create `src/app/watch/[key]/not-found.tsx`:

```tsx
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">Video not found</h1>
        <p className="text-sm text-neutral-400">
          This recording may have been removed or the link is invalid.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Visit `http://localhost:3000/watch/nonexistent.webm` should show "Video not found".

If you have a valid uploaded video key, visit `http://localhost:3000/watch/{key}` should show video player.

- [ ] **Step 5: Commit**

```bash
git add src/components/video-player.tsx src/app/watch/
git commit -m "feat: add watch page with video player and 404 handling"
```

---

### Task 8: UI Polish

**Files:**
- Modify: all component files for visual polish

- [ ] **Step 1: Apply Linear-inspired dark mode polish**

Review and polish all components for consistent spacing, typography, colors, and transitions across:

- `src/components/password-gate.tsx`
- `src/components/recorder.tsx`
- `src/components/device-selector.tsx`
- `src/components/recording-preview.tsx`
- `src/components/video-player.tsx`
- `src/app/layout.tsx`
- `src/app/watch/[key]/not-found.tsx`

- [ ] **Step 2: Verify all pages visually**

Check each state in the browser:
- Password gate
- Recorder idle (all 3 modes)
- Recording in progress
- Uploading with progress bar
- Done with share link
- Watch page with video
- 404 page

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: polish UI with Linear-inspired dark mode design"
```

---

### Task 9: End-to-End Verification

- [ ] **Step 1: Fill in `.env.local` with real R2 credentials**

Ensure all environment variables are set with actual Cloudflare R2 values.

- [ ] **Step 2: Full recording + playback test**

1. Visit `http://localhost:3000`
2. Enter password
3. Select "Screen" mode, pick a mic
4. Start recording, record for ~5 seconds, stop
5. Watch upload progress bar
6. Copy the share URL
7. Open the share URL in a new incognito window
8. Verify the video plays correctly

- [ ] **Step 3: Test all three recording modes**

Repeat step 2 for:
- Camera mode
- Screen + Camera mode (verify webcam overlay appears in recorded video)

- [ ] **Step 4: Test error states**

- Wrong password should show error message
- Invalid watch URL should show 404 page
- Cancel screen share during recording should be handled gracefully

- [ ] **Step 5: Deploy**

Pick one:

**Vercel:** push repo to GitHub, import in Vercel, paste env vars, deploy.

**Cloudflare Pages:** connect repo, build command `npm run build`, output `.next`, paste env vars.

**Self-hosted:** `npm run build && npm start` behind nginx/Caddy with HTTPS.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: end-to-end verification complete"
```

---

## What Jake needs to do before this can be built

1. Sign in to Cloudflare, enable R2 (free tier is fine for low volume)
2. Create an R2 bucket. Name it something like `hauck-yoom`
3. Turn on public access for the bucket, copy the `r2.dev` public URL
4. Generate an R2 API token with Object Read & Write, save the Access Key ID + Secret
5. Copy Account ID from the Cloudflare dashboard URL
6. Pick a strong upload password
7. Decide where to deploy (Vercel is easiest, free for personal use)
8. Hand all 7 env values to Claude, then approve `npm install` + the scaffolding commit
