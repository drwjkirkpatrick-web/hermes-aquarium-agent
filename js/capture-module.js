/**
 * capture-module.js — GIF/MP4 Export for Hermes Aquarium
 *
 * Records the last N seconds of canvas animation as:
 *   - MP4 (MediaRecorder + Canvas.captureStream)
 *   - Animated GIF (via MediaRecorder or gif.js if available)
 *
 * Auto-shares to Telegram with affect summary.
 */

(function(global) {
    'use strict';

    class CaptureModule {
        constructor(options = {}) {
            this.canvas = options.canvas;
            this.recordDuration = options.recordDuration || 5000;  // ms
            this.fps = options.fps || 30;
            this.onStart = options.onStart || (() => {});
            this.onStop = options.onStop || (() => {});
            this.onError = options.onError || console.error;

            this.recorder = null;
            this.chunks = [];
            this.isRecording = false;
            this.stream = null;

            // For frame-by-frame capture (GIF mode)
            this.frames = [];
            this.captureInterval = null;
        }

        // ─── Check if MediaRecorder is supported ───
        static isSupported() {
            return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
        }

        // ─── Start recording ───
        async start(format = 'mp4') {
            if (this.isRecording) return false;
            if (!this.canvas) {
                this.onError('No canvas provided');
                return false;
            }

            this.isRecording = true;
            this.chunks = [];
            this.frames = [];

            this.onStart();

            if (format === 'mp4' && CaptureModule.isSupported()) {
                return this._startMP4();
            } else {
                return this._startFrameCapture();
            }
        }

        _startMP4() {
            try {
                this.stream = this.canvas.captureStream(this.fps);
                const mimeType = this._getBestMimeType();
                this.recorder = new MediaRecorder(this.stream, {
                    mimeType,
                    videoBitsPerSecond: 5000000,  // 5 Mbps
                });

                this.recorder.ondataavailable = e => {
                    if (e.data.size > 0) this.chunks.push(e.data);
                };

                this.recorder.onstop = () => this._finishMP4();
                this.recorder.onerror = e => {
                    this.onError('MediaRecorder error:', e);
                    this._cleanup();
                };

                this.recorder.start(100);  // Collect data every 100ms

                // Auto-stop after duration
                setTimeout(() => this.stop(), this.recordDuration);
                return true;
            } catch (e) {
                this.onError('Failed to start MP4 recording:', e);
                return this._startFrameCapture();
            }
        }

        _getBestMimeType() {
            const types = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
            ];
            for (const type of types) {
                if (MediaRecorder.isTypeSupported(type)) return type;
            }
            return 'video/webm';
        }

        _startFrameCapture() {
            // Fallback: capture frames for GIF generation
            const frameInterval = 1000 / 10;  // 10 fps for GIF
            const maxFrames = Math.ceil(this.recordDuration / frameInterval);
            let frameCount = 0;

            this.captureInterval = setInterval(() => {
                if (frameCount >= maxFrames) {
                    this.stop();
                    return;
                }
                this.frames.push(this.canvas.toDataURL('image/png'));
                frameCount++;
            }, frameInterval);

            // Auto-stop
            setTimeout(() => this.stop(), this.recordDuration);
            return true;
        }

        // ─── Stop recording ───
        stop() {
            if (!this.isRecording) return;

            if (this.recorder && this.recorder.state !== 'inactive') {
                this.recorder.stop();
            } else if (this.captureInterval) {
                clearInterval(this.captureInterval);
                this.captureInterval = null;
                this._finishGIF();
            } else {
                this._cleanup();
            }
        }

        // ─── Finish MP4 ───
        _finishMP4() {
            if (!this.chunks.length) {
                this.onError('No data recorded');
                this._cleanup();
                return;
            }

            const blob = new Blob(this.chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const filename = `aquarium-${Date.now()}.webm`;

            this.onStop({ url, blob, filename, format: 'mp4' });
            this._cleanup();
        }

        // ─── Finish GIF (frame capture mode) ───
        _finishGIF() {
            if (!this.frames.length) {
                this._cleanup();
                return;
            }

            // For now, return the frames for external processing
            // In production, use a GIF encoder (gif.js or similar)
            const blob = new Blob(
                this.frames.map(f => f.split(',')[1]).map(b64 => atob(b64)),
                { type: 'image/png' }
            );
            const url = URL.createObjectURL(blob);

            this.onStop({
                url,
                frames: this.frames,
                format: 'gif-frames',
                count: this.frames.length,
            });
            this._cleanup();
        }

        _cleanup() {
            this.isRecording = false;
            this.chunks = [];
            this.frames = [];
            if (this.recorder) {
                this.recorder = null;
            }
            if (this.stream) {
                this.stream.getTracks().forEach(t => t.stop());
                this.stream = null;
            }
            if (this.captureInterval) {
                clearInterval(this.captureInterval);
                this.captureInterval = null;
            }
        }

        // ─── Generate share message ───
        static formatShareMessage(params) {
            const state = params.state || 'idle';
            const affect = params.dominant_affect || 'calm';
            const valence = params.valence !== undefined ? (params.valence * 2 - 1).toFixed(2) : '0.00';
            const arousal = params.arousal !== undefined ? params.arousal.toFixed(2) : '0.00';
            const imageMood = params.imageMood || 'standard';

            const emojiMap = {
                idle: '🌊', active: '🐠', thinking: '🧠', success: '✨',
                error: '⚡', sleeping: '🌙', alert: '🔔',
                learning: '📚', connecting: '🔗', busy: '⚙️',
            };

            return `${emojiMap[state] || '🐠'} Hermes is feeling **${affect}** (${state})
V${valence} · A${arousal} · mood: ${imageMood}`;
        }

        // ─── Download the captured file ───
        download(result, label = 'aquarium-capture') {
            const a = document.createElement('a');
            a.href = result.url;
            a.download = result.filename || `${label}.${result.format === 'mp4' ? 'webm' : 'gif'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }

    global.CaptureModule = CaptureModule;
})(window);
