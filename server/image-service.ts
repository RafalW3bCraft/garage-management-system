import sharp from 'sharp';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';

// Image configuration
export const IMAGE_CONFIG = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  
  // Image dimensions
  profile: {
    width: 400,
    height: 400,
    quality: 85
  },
  car: {
    width: 800,
    height: 600,
    quality: 85
  },
  thumbnail: {
    width: 150,
    height: 150,
    quality: 80
  }
};

// Multer configuration for file uploads
export const createMulterConfig = (destinationPath: string) => {
  return multer({
    storage: multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          await fs.access(destinationPath);
        } catch {
          await fs.mkdir(destinationPath, { recursive: true });
        }
        cb(null, destinationPath);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
      }
    }),
    fileFilter: (req, file, cb) => {
      if (IMAGE_CONFIG.allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Only ${IMAGE_CONFIG.allowedTypes.join(', ')} are allowed.`));
      }
    },
    limits: {
      fileSize: IMAGE_CONFIG.maxFileSize
    }
  });
};

// Image processing service
export class ImageService {
  static async processImage(
    inputPath: string, 
    outputPath: string, 
    config: { width: number; height: number; quality: number }
  ): Promise<void> {
    await sharp(inputPath)
      .resize(config.width, config.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: config.quality })
      .toFile(outputPath);
  }

  static async createThumbnail(
    inputPath: string, 
    thumbnailPath: string
  ): Promise<void> {
    await this.processImage(inputPath, thumbnailPath, IMAGE_CONFIG.thumbnail);
  }

  static async processProfileImage(
    inputPath: string, 
    outputPath: string
  ): Promise<void> {
    await this.processImage(inputPath, outputPath, IMAGE_CONFIG.profile);
  }

  static async processCarImage(
    inputPath: string, 
    outputPath: string
  ): Promise<void> {
    await this.processImage(inputPath, outputPath, IMAGE_CONFIG.car);
  }

  static async deleteImage(imagePath: string): Promise<void> {
    try {
      await fs.unlink(imagePath);
    } catch (error) {
      console.warn(`Failed to delete image: ${imagePath}`, error);
    }
  }

  static generateImageUrl(filename: string, type: 'profiles' | 'cars' | 'thumbs' = 'profiles'): string {
    return `/uploads/${type}/${filename}`;
  }

  static async validateImage(filePath: string): Promise<boolean> {
    try {
      const metadata = await sharp(filePath).metadata();
      
      // Check if it's a valid image
      if (!metadata.width || !metadata.height) {
        return false;
      }

      // Check dimensions (minimum requirements)
      if (metadata.width < 100 || metadata.height < 100) {
        return false;
      }

      // Check max dimensions (reasonable limits)
      if (metadata.width > 4000 || metadata.height > 4000) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Image validation failed:', error);
      return false;
    }
  }
}

// Multer instances for different upload types
export const profileUpload = createMulterConfig('public/uploads/profiles');
export const carUpload = createMulterConfig('public/uploads/cars');