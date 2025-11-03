// index.js
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { Storage } = require("@google-cloud/storage");

const app = express();
const PORT = process.env.PORT || 8080;

// ✅ CORS setup
const ALLOWED_ORIGINS = [
  "https://your-project.web.app",
  "https://your-project.firebaseapp.com"
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));

// ✅ Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// ✅ Google Cloud credentials from environment variable
let gcpCredentials;
try {
  gcpCredentials = JSON.parse(process.env.GOOGLE_CLOUD_KEY);
} catch (err) {
  console.error("Missing or invalid GOOGLE_CLOUD_KEY env variable");
  process.exit(1);
}

const storage = new Storage({
  projectId: gcpCredentials.project_id,
  credentials: {
    client_email: gcpCredentials.client_email,
    private_key: gcpCredentials.private_key
  }
});

// Example: upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const bucketName = "music-analysis-app_cloudbuild"; // replace with your bucket
    await storage.bucket(bucketName).upload(filePath, {
      destination: req.file.originalname
    });

    fs.unlinkSync(filePath); // cleanup temp file
    res.json({ success: true, message: "File uploaded to GCS" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
