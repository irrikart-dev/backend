import multer from 'multer';
import { BadRequestError } from '../errors/AppError.js';

// single image in memory (multipart field "file", max 5MB) — shared by the admin and
// vendor upload routes; oversize files surface as a MulterError → 400 in errorHandler
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new BadRequestError('Only image files can be uploaded')),
}).single('file');
