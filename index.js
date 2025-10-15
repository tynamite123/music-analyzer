// index.js
// Express backend with Multer uploads, CORS lockdown, ffmpeg conversion, and BPM via Essentia.js

// Node/Express basics
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Audio tooling
const ffmpegPath = require("ffmpeg-static");
const WavDecoder = require("wav-decoder");

// Essentia.js (WASM): load via dynamic import for CommonJS
let essentia = null;
async function initEssentia() {
  // Use the ES module build shipped with the package
  const { default: EssentiaCore } = await import("essentia.js/dist/essentia.js-core.es.js");
  const { EssentiaWASM } = await import("essentia.js/dist/essentia-wasm.es.js");
  essentia = new EssentiaCore(EssentiaWASM);
  // Optionally log version or available algorithms
  // console.log("Essentia.js version:", essentia.version);
  // console.log("Algorithms:", essentia.algorithmNames.slice(0, 10));
}
const initPromise = initEssentia(); // kick off at module load

// ---------- Config ----------
const PORT = process.env.PORT || 8080;

// Replace with your actual Firebase Hosting domains
const ALLOWED_ORIGINS = [
  "https://YOUR_PROJECT_ID.web.app",
  "https://YOUR_PROJECT_ID.firebaseapp.com",
];

const app = express();

// Strict CORS: only allow your frontend domains
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow same-origin/local tools
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("CORS: Origin not allowed"));
    },
    methods: ["POST", "OPTIONS", "GET"],
    allowedHeaders: ["Content-Type"],
    maxAge: 86400,
  })
);

// Multer storage: temp folder outside any public path
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

// Accept only MP3/WAV; limit size
const allowedMimes = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"]);
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okExt = ext === ".mp3" || ext === ".wav";
    const okMime = allowedMimes.has(file.mimetype);
    if (okExt && okMime) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

// ---------- Helpers ----------

// Convert any audio to mono 44.1kHz WAV using ffmpeg; return temp WAV path
function toMonoWav(inputPath) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(
      uploadDir,
      `${path.basename(inputPath, path.extname(inputPath))}-mono.wav`
    );

    const ff = spawn(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-ac", "1",         // mono
      "-ar", "44100",     // sample rate
      "-vn",
      "-f", "wav",
      outPath,
    ]);

    let err = "";
    ff.stderr.on("data", (d) => (err += d.toString()));
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`ffmpeg failed (${code}): ${err}`));
    });
  });
}

// Decode WAV samples (Float32Array) from a file
async function decodeWavFloat32(wavPath) {
  const buf = fs.readFileSync(wavPath);
  const wav = await WavDecoder.decode(buf);
  const channelData = wav.channelData && wav.channelData[0] ? wav.channelData[0] : null;
  if (!channelData) throw new Error("No channel data decoded");
  return { samples: channelData, sampleRate: wav.sampleRate };
}

// Compute BPM using Essentia.js RhythmExtractor2013
function computeBpmEssentia(samples, sampleRate) {
  // RhythmExtractor2013 expects a mono PCM signal and sample rate; returns tempo and beats
  // Docs: tempo estimation demo and API references for Essentia.js algorithms.
  const r = essentia.RhythmExtractor2013({
    signal: samples,
    sampleRate: sampleRate,
  });
  // r.tempo, r.beats, r.ticks, r.confidence
  return {
    bpm: r.tempo,
    confidence: r.confidence,
    beats: r.beats, // array of beat times in seconds
  };
}

// Clean up files safely
function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

// ---------- Routes ----------

app.get("/health", async (req, res) => {
  try {
    await initPromise;
    res.json({ ok: true, essentiaReady: !!essentia });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Essentia init failed" });
  }
});

app.post("/upload", upload.array("track", 10), async (req, res) => {
  try {
    await initPromise;
    if (!essentia) throw new Error("Essentia not initialized");
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const results = [];

  for (const file of req.files) {
    const originalPath = file.path;
    let wavPath;

    try {
      // Convert to mono WAV for analysis
      wavPath = await toMonoWav(originalPath);

      // Decode samples
      const { samples, sampleRate } = await decodeWavFloat32(wavPath);

      // Compute BPM via Essentia
      const rhythm = computeBpmEssentia(samples, sampleRate);

      results.push({
        originalName: file.originalname,
        bpm: Math.round(rhythm.bpm * 100) / 100,
        confidence: Math.round(rhythm.confidence * 1000) / 1000,
        beats: rhythm.beats, // optionally omit if payload size matters
      });
    } catch (err) {
      results.push({
        originalName: file.originalname,
        error: err.message,
      });
    } finally {
      // Remove temp files
      safeUnlink(originalPath);
      if (wavPath) safeUnlink(wavPath);
    }
  }

  res.json({ tracks: results });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
