// index.js (ES module)
import express from "express";
import cors from "cors";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

if (!process.env.BUCKET_NAME) {
  console.warn("⚠️ BUCKET_NAME env var not set. Uploads to GCS will fail until set.");
}

// Configure Google Cloud Storage: if GOOGLE_APPLICATION_CREDENTIALS not set, uses default ADC
const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined
});
const BUCKET_NAME = process.env.BUCKET_NAME;
const bucket = BUCKET_NAME ? storage.bucket(BUCKET_NAME) : null;

app.use(cors());
app.use(express.json());

// Ensure uploads folder exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: "uploads/" });

app.get("/health", (req, res) => res.send("ok"));
app.get("/healthz", (req, res) => res.send("ok"));

// Upload route: save file, run Python analyzer, upload MP3 + JSON to GCS
app.post("/upload", upload.single("track"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    // sanitize filename
    const safeName = req.file.originalname.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_");
    const savedPath = path.join(UPLOADS_DIR, safeName);

    fs.renameSync(req.file.path, savedPath);
    console.log(`📥 Saved uploaded file: ${savedPath}`);

    // run python analyzer against uploads folder
    // use 'python3' which is installed in container
    const pyCmd = `python3 music_analyzer.py uploads`;
    console.log(`🐍 Running: ${pyCmd}`);
    exec(pyCmd, { cwd: __dirname, maxBuffer: 1024 * 1024 * 10 }, async (err, stdout, stderr) => {
      console.log("🐍 PYTHON STDOUT:\n", stdout);
      if (stderr) console.error("🐍 PYTHON STDERR:\n", stderr);

      if (err) {
        console.error("❌ Analyzer failed:", err);
        return res.status(500).json({ error: "Analysis failed", details: stderr || err.message });
      }

      // upload original mp3 to GCS
      if (bucket) {
        try {
          const destName = `uploads/${safeName}`;
          await bucket.upload(savedPath, { destination: destName, resumable: false });
          console.log(`✅ Uploaded MP3 to gs://${BUCKET_NAME}/${destName}`);
        } catch (upErr) {
          console.error("⚠️ Failed to upload MP3 to GCS:", upErr);
        }
      }

      // upload analysis JSON if produced
      const jsonPath = path.join(UPLOADS_DIR, "music_analysis.json");
      if (fs.existsSync(jsonPath) && bucket) {
        try {
          await bucket.upload(jsonPath, { destination: "music_analysis.json", resumable: false });
          console.log(`✅ Uploaded analysis JSON to gs://${BUCKET_NAME}/music_analysis.json`);
        } catch (upErr) {
          console.error("⚠️ Failed to upload JSON to GCS:", upErr);
        }
      }

      res.json({ ok: true, message: "Uploaded and analyzed", pythonStdout: stdout });
    });

  } catch (e) {
    console.error("Server error in /upload:", e);
    res.status(500).json({ error: "Server error", details: e.message });
  }
});

app.get("/results-json", async (req, res) => {
  // try to read from local uploads first, then from GCS
  const localPath = path.join(UPLOADS_DIR, "music_analysis.json");
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }
  if (!bucket) return res.status(404).send("No analysis found locally or GCS not configured.");
  try {
    const file = bucket.file("music_analysis.json");
    const [exists] = await file.exists();
    if (!exists) return res.status(404).send("No analysis found in GCS.");
    const [contents] = await file.download();
    res.type("application/json").send(contents);
  } catch (err) {
    console.error("Error fetching results from GCS:", err);
    res.status(500).send("Failed to get results.");
  }
});

app.get("/", (req, res) => {
  res.send("Music analyzer backend is running.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on port ${PORT} and bound to 0.0.0.0`);
});
