// index.js
// Run: node index.js
// Required packages: express, multer, @google-cloud/storage, cors

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 8080;

// ======= Configuration =======
// Allowed origins for CORS - adjust to your frontend domains
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://your-frontend.web.app',
  'https://your-frontend.firebaseapp.com'
];

// Default GCS bucket name. You can override with env var GCS_BUCKET.
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
  console.error('Set the service account JSON as the GOOGLE_CLOUD_KEY env var in Render.');
  process.exit(1);
}

let gcpCreds;
try {
  // Some hosts convert newlines to literal \n when you paste multi-line JSON.
  // Replace literal \\n with real newlines before parsing.
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
// multipart form field name: file
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const bucketName = process.env.GCS_BUCKET || DEFAULT_BUCKET;
  const localPath = req.file.path;
  const destination = req.file.originalname;

  try {
    // Ensure bucket exists or the service account has permission
    await storage.bucket(bucketName).upload(localPath, { destination });

    // Remove local temp file
    try { fs.unlinkSync(localPath); } catch (e) { /* ignore */ }

    return res.json({
      success: true,
      bucket: bucketName,
      object: destination
    });
  } catch (err) {
    console.error('Upload failed:', err);
    try { fs.unlinkSync(localPath); } catch (e) { /* ignore */ }
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
