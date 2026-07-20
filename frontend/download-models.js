/**
 * Script to download face-api.js models
 * Run this with: node download-models.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
const MODELS_DIR = path.join(__dirname, 'public', 'models');

const models = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1'
];

// Create models directory if it doesn't exist
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        file.close();
        fs.unlinkSync(filepath);
        downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlinkSync(filepath);
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

async function downloadModels() {
  console.log('Downloading face-api.js models...');
  console.log(`Saving to: ${MODELS_DIR}\n`);

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const url = `${MODEL_URL}/${model}`;
    const filepath = path.join(MODELS_DIR, model);
    
    try {
      process.stdout.write(`[${i + 1}/${models.length}] Downloading ${model}... `);
      await downloadFile(url, filepath);
      console.log('✓');
    } catch (error) {
      console.log('✗');
      console.error(`Error downloading ${model}:`, error.message);
      throw error;
    }
  }

  console.log('\n✓ All models downloaded successfully!');
  console.log(`Models are located in: ${MODELS_DIR}`);
}

downloadModels().catch((error) => {
  console.error('\n✗ Error downloading models:', error);
  process.exit(1);
});
