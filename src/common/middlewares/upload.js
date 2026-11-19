import multer from 'multer';
import { BadRequestError } from '../errors/AppError.js';

// single image in memory (multipart field "file", max 5MB) — shared by the admin and
// vendor upload routes; oversize files surface as a MulterError → 400 in errorHandler
// only formats every browser and the app can render — HEIC/AVIF etc. would upload
// fine and then show as a broken image. Keep in step with the dashboard's Dropzone.
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ACCEPTED.includes(file.mimetype)
      ? cb(null, true)
      : cb(new BadRequestError('Only JPG, PNG or WebP images can be uploaded')),
}).single('file');
