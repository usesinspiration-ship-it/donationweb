import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
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

// Cloudflare R2 Client
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

// Supabase Client (Metadata Database)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = process.env.R2_BUCKET_NAME || 'reciept';

// 1. UPLOAD (File to R2 + Metadata to Supabase)
app.put('/upload', async (req, res) => {
  try {
    const { fileName } = req.query;
    const metadata = JSON.parse(req.headers['x-metadata'] || '{}');
    
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      
      // 1a. Upload File to Cloudflare R2
      const s3Command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: fileName,
        Body: buffer,
        ContentType: 'application/pdf',
        Metadata: metadata, // Keep as backup
      });
      await s3Client.send(s3Command);

      // 1b. Save Metadata to Supabase
      const { error: sbError } = await supabase
        .from('donations')
        .upsert({
          id: fileName, // Use fileName as ID to link both
          receipt_no: metadata.receiptno,
          donor_name: metadata.donorname,
          amount: parseFloat(metadata.amount),
          pan_number: metadata.pannumber,
          city: metadata.city,
          phone_number: metadata.phonenumber,
          date: metadata.date,
          timestamp: metadata.timestamp,
          branch: metadata.branch
        });

      if (sbError) throw sbError;
      
      res.json({ success: true });
    });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. LIST (Fetching from Supabase - High Performance)
app.get('/list', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Map Supabase fields back to the format the frontend expects
    const filesWithMetadata = data.map(item => ({
      key: item.id,
      metadata: {
        receiptno: item.receipt_no,
        donorname: item.donor_name,
        amount: item.amount.toString(),
        pannumber: item.pan_number,
        city: item.city,
        phonenumber: item.phone_number,
        date: item.date,
        timestamp: item.timestamp,
        branch: item.branch
      }
    }));

    res.json({
      success: true,
      files: filesWithMetadata,
    });
  } catch (error) {
    console.error("List Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. DELETE (From R2 and Supabase)
app.delete('/delete', async (req, res) => {
  try {
    const { file } = req.query;
    
    // Delete from R2
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: file }));
    
    // Delete from Supabase
    const { error } = await supabase
      .from('donations')
      .delete()
      .eq('id', file);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. VERIFY BY PAN (Direct Database Query)
app.get('/verify-pan', async (req, res) => {
  try {
    const { pan } = req.query;
    if (!pan) return res.status(400).json({ error: "PAN number is required" });

    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .ilike('pan_number', pan) // Case-insensitive match
      .order('created_at', { ascending: false });

    if (error) throw error;

    const donations = data.map(item => ({
      key: item.id,
      receiptNo: item.receipt_no,
      donorName: item.donor_name,
      amount: item.amount,
      date: item.date,
      branch: item.branch
    }));

    res.json({
      success: true,
      donations: donations,
    });
  } catch (error) {
    console.error("Verify Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. DOWNLOAD / VIEW
app.get('/download', async (req, res) => {
  try {
    const { file } = req.query;
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: file });
    const response = await s3Client.send(command);
    
    res.setHeader('Content-Type', response.ContentType || 'application/pdf');
    response.Body.pipe(res);
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
