// index.js
// Express backend with Multer uploads, CORS, ffmpeg conversion, and BPM via Essentia.js

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

const app = express();

// ---------- Serve Essentia WASM files ----------
app.use("/essentia", express.static(path.join(__dirname, "public/essentia")));

// ---------- CORS CONFIG ----------
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://music-analyzer.web.app",
  "https://music-analyzer.firebaseapp.com"
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow server-to-server, curl, Postman
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("CORS: Origin not allowed"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
    maxAge: 86400
  })
);

// ---------- Essentia.js WASM Initialization ----------
let essentia = null;

async function initEssentia() {
  try {
    const { default: EssentiaCore } = await import("essentia.js/dist/essentia.js-core.es.js");
    const { EssentiaWASM } = await import("essentia.js/dist/essentia-wasm.es.js");

    essentia = new EssentiaCore(EssentiaWASM, {
      wasmURL: "/essentia/essentia-wasm.wasm.wasm"
    });

    console.log("Essentia initialized successfully");
  } catch (err) {
    console.error("Essentia init error:", err);
    throw err;
  }
}

const initPromise = initEssentia();

// ---------- Config ----------
const PORT = process.env.PORT || 8080;

// Multer storage
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

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
      "-ac", "1",
      "-ar", "44100",
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

async function decodeWavFloat32(wavPath) {
  const buf = fs.readFileSync(wavPath);
  const wav = await WavDecoder.decode(buf);
  const channelData = wav.channelData && wav.channelData[0] ? wav.channelData[0] : null;
  if (!channelData) throw new Error("No channel data decoded");
  return { samples: channelData, sampleRate: wav.sampleRate };
}

function computeBpmEssentia(samples, sampleRate) {
  const r = essentia.RhythmExtractor2013({
    signal: samples,
    sampleRate: sampleRate,
  });
  return {
    bpm: r.tempo,
    confidence: r.confidence,
    beats: r.beats,
  };
}

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
      wavPath = await toMonoWav(originalPath);
      const { samples, sampleRate } = await decodeWavFloat32(wavPath);
      const rhythm = computeBpmEssentia(samples, sampleRate);

      results.push({
        originalName: file.originalname,
        bpm: Math.round(rhythm.bpm * 100) / 100,
        confidence: Math.round(rhythm.confidence * 1000) / 1000,
        beats: rhythm.beats,
      });
    } catch (err) {
      results.push({
        originalName: file.originalname,
        error: err.message,
      });
    } finally {
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
