import sharp from 'sharp';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';

// Image configuration with progressive loading support
export const IMAGE_CONFIG = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  
  // Image dimensions with progressive loading sizes
  profile: {
    width: 400,
    height: 400,
    quality: 85,
    webpQuality: 80
  },
  car: {
    width: 800,
    height: 600,
    quality: 85,
    webpQuality: 80
  },
  thumbnail: {
    width: 150,
    height: 150,
    quality: 80,
    webpQuality: 75
  },
  // Progressive loading sizes
  progressive: {
    small: { width: 400, height: 300, quality: 85, webpQuality: 80 },
    medium: { width: 600, height: 450, quality: 85, webpQuality: 80 },
    large: { width: 800, height: 600, quality: 85, webpQuality: 80 }
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

// Image processing service with WebP support
export class ImageService {
  /**
   * Process image with WebP conversion for optimal web delivery
   * Generates both WebP (primary) and JPEG (fallback) versions
   */
  static async processImage(
    inputPath: string, 
    outputPath: string, 
    config: { width: number; height: number; quality: number; webpQuality?: number }
  ): Promise<{ jpeg: string; webp: string }> {
    const webpQuality = config.webpQuality || config.quality;
    const baseOutputPath = outputPath.replace(/\.(jpg|jpeg|png)$/i, '');
    const jpegPath = `${baseOutputPath}.jpg`;
    const webpPath = `${baseOutputPath}.webp`;

    // Create Sharp instance with resizing
    const sharpInstance = sharp(inputPath)
      .resize(config.width, config.height, {
        fit: 'cover',
        position: 'center'
      });

    // Generate WebP version (smaller, better compression)
    await sharpInstance
      .clone()
      .webp({ quality: webpQuality, effort: 4 })
      .toFile(webpPath);

    // Generate JPEG fallback for browser compatibility
    await sharpInstance
      .clone()
      .jpeg({ quality: config.quality, progressive: true })
      .toFile(jpegPath);

    return { jpeg: jpegPath, webp: webpPath };
  }

  /**
   * Create thumbnail with WebP support
   * Returns paths to both WebP and JPEG versions
   */
  static async createThumbnail(
    inputPath: string, 
    thumbnailPath: string
  ): Promise<{ jpeg: string; webp: string }> {
    return await this.processImage(inputPath, thumbnailPath, IMAGE_CONFIG.thumbnail);
  }

  /**
   * Process profile image with WebP conversion
   * Returns paths to both WebP and JPEG versions
   */
  static async processProfileImage(
    inputPath: string, 
    outputPath: string
  ): Promise<{ jpeg: string; webp: string }> {
    return await this.processImage(inputPath, outputPath, IMAGE_CONFIG.profile);
  }

  /**
   * Process car image with WebP conversion
   * Returns paths to both WebP and JPEG versions
   */
  static async processCarImage(
    inputPath: string, 
    outputPath: string
  ): Promise<{ jpeg: string; webp: string }> {
    return await this.processImage(inputPath, outputPath, IMAGE_CONFIG.car);
  }

  static async deleteImage(imagePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.unlink(imagePath);
      console.log(`Successfully deleted image: ${imagePath}`);
      return { success: true };
    } catch (error: unknown) {
      // Handle different types of file deletion errors
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        console.warn(`Image file not found (already deleted): ${imagePath}`);
        return { success: true }; // Treat as success since file doesn't exist
      } else if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        console.error(`Permission denied deleting image: ${imagePath}`, error);
        return { success: false, error: 'Permission denied' };
      } else {
        console.error(`Failed to delete image: ${imagePath}`, error);
        return { success: false, error: nodeError.message || 'Unknown error' };
      }
    }
  }

  static async deleteImageWithThumbnail(
    mainImagePath: string, 
    imageType: 'profiles' | 'cars'
  ): Promise<{ success: boolean; mainDeleted: boolean; thumbDeleted: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Delete main image
    const mainResult = await this.deleteImage(mainImagePath);
    const mainDeleted = mainResult.success;
    if (!mainResult.success && mainResult.error) {
      errors.push(`Main image: ${mainResult.error}`);
    }

    // Generate thumbnail path and delete it - thumbnails are created with 'thumb-' prefix
    const filename = path.basename(mainImagePath);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);
    
    const thumbResult = await this.deleteImage(thumbnailPath);
    const thumbDeleted = thumbResult.success;
    if (!thumbResult.success && thumbResult.error) {
      errors.push(`Thumbnail: ${thumbResult.error}`);
    }

    // Log the operation
    console.log(`Image deletion complete - Main: ${mainDeleted}, Thumbnail: ${thumbDeleted}, Errors: ${errors.length}`);

    return {
      success: mainDeleted && thumbDeleted,
      mainDeleted,
      thumbDeleted,
      errors
    };
  }

  static async deleteImagesForUser(userId: string, profileImageUrl?: string): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!profileImageUrl) {
      return { success: true, errors: [] }; // No image to delete
    }

    try {
      // Extract filename from URL (format: /uploads/profiles/filename.ext)
      const filename = profileImageUrl.split('/').pop();
      if (!filename) {
        errors.push('Invalid profile image URL format');
        return { success: false, errors };
      }

      const mainImagePath = path.join('public/uploads/profiles', filename);
      const result = await this.deleteImageWithThumbnail(mainImagePath, 'profiles');
      
      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }

      console.log(`Profile image cleanup for user ${userId}: ${result.success ? 'success' : 'partial/failed'}`);
      
      return {
        success: result.success,
        errors
      };
    } catch (error: unknown) {
      const errorMsg = `Unexpected error during profile image cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      return { success: false, errors };
    }
  }

  static async deleteImagesForCar(carId: string, carImageUrl?: string): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!carImageUrl) {
      return { success: true, errors: [] }; // No image to delete
    }

    try {
      // Extract filename from URL (format: /uploads/cars/filename.ext)
      const filename = carImageUrl.split('/').pop();
      if (!filename) {
        errors.push('Invalid car image URL format');
        return { success: false, errors };
      }

      const mainImagePath = path.join('public/uploads/cars', filename);
      const result = await this.deleteImageWithThumbnail(mainImagePath, 'cars');
      
      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }

      console.log(`Car image cleanup for car ${carId}: ${result.success ? 'success' : 'partial/failed'}`);
      
      return {
        success: result.success,
        errors
      };
    } catch (error: unknown) {
      const errorMsg = `Unexpected error during car image cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      return { success: false, errors };
    }
  }

  /**
   * Generate image URLs for both WebP and JPEG versions
   * Returns object with both URLs for <picture> element usage
   */
  static generateImageUrls(filename: string, type: 'profiles' | 'cars' | 'thumbs' = 'profiles'): { webp: string; jpeg: string; fallback: string } {
    const baseFilename = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    return {
      webp: `/uploads/${type}/${baseFilename}.webp`,
      jpeg: `/uploads/${type}/${baseFilename}.jpg`,
      fallback: `/uploads/${type}/${baseFilename}.jpg` // JPEG as fallback
    };
  }

  /**
   * Legacy method - returns JPEG URL for backward compatibility
   */
  static generateImageUrl(filename: string, type: 'profiles' | 'cars' | 'thumbs' = 'profiles'): string {
    const baseFilename = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    return `/uploads/${type}/${baseFilename}.jpg`;
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