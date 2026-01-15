// index.js
// Run: node index.js

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 8080;

// ======= DEBUG: Show exactly what Render stored =======
console.log("RAW GOOGLE_CLOUD_KEY:", JSON.stringify(process.env.GOOGLE_CLOUD_KEY));

// ======= Configuration =======
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://your-frontend.web.app',
  'https://your-frontend.firebaseapp.com'
];

const DEFAULT_BUCKET = process.env.GCS_BUCKET || 'music-analyzer-uploads';

// ======= CORS setup =======
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed'), false);
  }
}));

// ======= Load Google credentials from env =======
if (!process.env.GOOGLE_CLOUD_KEY) {
  console.error('ERROR: Missing GOOGLE_CLOUD_KEY environment variable.');
  process.exit(1);
}

let gcpCreds;
try {
  // Convert \\n → real newlines
  const raw = process.env.GOOGLE_CLOUD_KEY.replace(/\\n/g, '\n');
  gcpCreds = JSON.parse(raw);
} catch (err) {
  console.error('ERROR: Failed to parse GOOGLE_CLOUD_KEY JSON:', err.message);
  process.exit(1);
}

// Validate minimal fields
if (!gcpCreds.client_email || !gcpCreds.private_key || !gcpCreds.project_id) {
  console.error('ERROR: GOOGLE_CLOUD_KEY JSON is missing required fields.');
  process.exit(1);
}

// ======= Create Storage client =======
const storage = new Storage({
  projectId: gcpCreds.project_id,
  credentials: {
    client_email: gcpCreds.client_email,
    private_key: gcpCreds.private_key
  }
});

// ======= Upload endpoint =======
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const bucketName = process.env.GCS_BUCKET || DEFAULT_BUCKET;
  const localPath = req.file.path;
  const destination = req.file.originalname;

  try {
    await storage.bucket(bucketName).upload(localPath, { destination });

    try { fs.unlinkSync(localPath); } catch (e) {}

    return res.json({
      success: true,
      bucket: bucketName,
      object: destination
    });
  } catch (err) {
    console.error('Upload failed:', err);
    try { fs.unlinkSync(localPath); } catch (e) {}
    return res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ======= Health endpoint =======
app.get('/health', (req, res) => res.json({ ok: true }));

// ======= Start server =======
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Using GCS bucket: ${process.env.GCS_BUCKET || DEFAULT_BUCKET}`);
});
