import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.R2_BUCKET_NAME || 'reciept';

// 1. UPLOAD
app.put('/upload', async (req, res) => {
  try {
    const { fileName, metadata } = req.query;
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: fileName,
        Body: buffer,
        ContentType: 'application/pdf',
        Metadata: JSON.parse(req.headers['x-metadata'] || '{}'),
      });
      await s3Client.send(command);
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. LIST (Optimized to fetch metadata in parallel)
app.get('/list', async (req, res) => {
  try {
    const listCommand = new ListObjectsV2Command({ Bucket: BUCKET });
    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents) {
      return res.json({ success: true, files: [] });
    }

    // Fetch metadata for all files in parallel
    const filesWithMetadata = await Promise.all(
      listResponse.Contents.map(async (item) => {
        try {
          const headCommand = new HeadObjectCommand({ Bucket: BUCKET, Key: item.Key });
          const headResponse = await s3Client.send(headCommand);
          return {
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified,
            metadata: headResponse.Metadata
          };
        } catch (e) {
          return {
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified,
            metadata: {}
          };
        }
      })
    );

    res.json({
      success: true,
      files: filesWithMetadata,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. DELETE
app.delete('/delete', async (req, res) => {
  try {
    const { file } = req.query;
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: file }));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. METADATA
app.get('/metadata', async (req, res) => {
  try {
    const { file } = req.query;
    const response = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: file }));
    res.json({ success: true, metadata: response.Metadata });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle React routing (fallback for SPA)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
