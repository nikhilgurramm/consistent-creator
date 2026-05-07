const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');

const app = express();
const PORT = 3847;

// Check FFmpeg availability
let ffmpegAvailable = false;
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  ffmpegAvailable = true;
  console.log('✅ FFmpeg found — MP4 conversion enabled');
} catch {
  console.warn('⚠️  FFmpeg not found — recordings will save as .webm\n   Install with: brew install ffmpeg');
}

// Temp directory for uploads before conversion
const tmpDir = path.join(__dirname, '.tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// Default recordings dir
const defaultRecordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(defaultRecordingsDir)) fs.mkdirSync(defaultRecordingsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `tmp_${timestamp}.webm`);
  }
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Native macOS folder picker
app.get('/pick-folder', (req, res) => {
  try {
    const script = 'osascript -e \'tell application "System Events" to activate\' -e \'set chosenFolder to choose folder with prompt "Select save folder"\' -e \'POSIX path of chosenFolder\'';
    exec(script, (err, stdout, stderr) => {
      if (err) {
        // User cancelled or error
        return res.json({ cancelled: true });
      }
      const folderPath = stdout.trim();
      // Remove trailing slash if present
      const cleaned = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
      res.json({ path: cleaned });
    });
  } catch (err) {
    res.json({ cancelled: true });
  }
});

// Upload + convert to MP4
app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const outputDir = (req.body.outputDir && req.body.outputDir.trim()) || defaultRecordingsDir;
  const customName = req.body.fileName && req.body.fileName.trim();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = customName || `recording_${timestamp}`;
  console.log(`📂 Save folder: ${outputDir}`);
  console.log(`📝 File name: ${baseName}`);
  const tmpPath = req.file.path;

  // Ensure output directory exists
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create output directory:', err.message);
    // Clean up tmp file
    try { fs.unlinkSync(tmpPath); } catch {}
    return res.status(400).json({ error: `Invalid directory: ${outputDir}` });
  }

  if (ffmpegAvailable) {
    const outputFilename = `${baseName}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);

    // Straight format conversion — preserve original resolution and frame rate
    const cmd = `ffmpeg -y -i "${tmpPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`;
    console.log(`🔧 FFmpeg: converting to MP4 (max quality passthrough)`);

    exec(cmd, (err, stdout, stderr) => {
      // Clean up tmp file
      try { fs.unlinkSync(tmpPath); } catch {}

      if (err) {
        console.error('FFmpeg error:', stderr);
        return res.status(500).json({ error: 'MP4 conversion failed' });
      }

      const stat = fs.statSync(outputPath);
      console.log(`✅ Saved: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
      res.json({
        success: true,
        filename: outputFilename,
        path: outputPath,
        size: stat.size,
        format: 'mp4'
      });
    });
  } else {
    // Fallback: save as .webm
    const outputFilename = `${baseName}.webm`;
    const outputPath = path.join(outputDir, outputFilename);
    fs.renameSync(tmpPath, outputPath);

    const stat = fs.statSync(outputPath);
    console.log(`✅ Saved: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
    res.json({
      success: true,
      filename: outputFilename,
      path: outputPath,
      size: stat.size,
      format: 'webm'
    });
  }
});

// Get default save path
app.get('/default-path', (req, res) => {
  res.json({ path: defaultRecordingsDir });
});

app.listen(PORT, () => {
  console.log(`\n🎥 Vertical Recorder running at http://localhost:${PORT}\n`);
});
