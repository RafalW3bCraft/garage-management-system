import sharp from 'sharp';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { FileValidator } from './file-validator';

export const IMAGE_CONFIG = {

  maxFileSize: 5 * 1024 * 1024,

  allowedTypes: [
    'image/jpeg', 
    'image/jpg', 
    'image/png', 
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/avif'
  ],
  allowedExtensions: [
    '.jpg', 
    '.jpeg', 
    '.png', 
    '.webp',
    '.gif',
    '.svg',
    '.bmp',
    '.tiff',
    '.tif',
    '.ico',
    '.avif'
  ],

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

  progressive: {
    small: { width: 400, height: 300, quality: 85, webpQuality: 80 },
    medium: { width: 600, height: 450, quality: 85, webpQuality: 80 },
    large: { width: 800, height: 600, quality: 85, webpQuality: 80 }
  }
};

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

      const doubleExtResult = FileValidator.validateDoubleExtension(file.originalname);
      if (!doubleExtResult.isValid) {
        console.error(`[UPLOAD_SECURITY] ${doubleExtResult.securityIssue}: ${file.originalname}`);
        cb(new Error(doubleExtResult.error || 'Invalid file name'));
        return;
      }

      if (!IMAGE_CONFIG.allowedTypes.includes(file.mimetype)) {
        console.error(`[UPLOAD_SECURITY] Rejected MIME type: ${file.mimetype} for ${file.originalname}`);
        cb(new Error(`Invalid file type. Only image files are allowed.`));
        return;
      }

      const ext = path.extname(file.originalname).toLowerCase();
      if (!IMAGE_CONFIG.allowedExtensions.includes(ext)) {
        console.error(`[UPLOAD_SECURITY] Rejected extension: ${ext} for ${file.originalname}`);
        cb(new Error(`Invalid file extension. Only ${IMAGE_CONFIG.allowedExtensions.join(', ')} are allowed.`));
        return;
      }
      
      cb(null, true);
    },
    limits: {
      fileSize: IMAGE_CONFIG.maxFileSize
    }
  });
};

export class ImageService {
  

  static async processImage(
    inputPath: string, 
    outputPath: string, 
    config: { width: number; height: number; quality: number; webpQuality?: number }
  ): Promise<{ jpeg: string; webp: string }> {
    const webpQuality = config.webpQuality || config.quality;
    const baseOutputPath = outputPath.replace(/\.(jpg|jpeg|png|gif|bmp|tiff|tif|ico|avif|webp)$/i, '');
    const jpegPath = `${baseOutputPath}.jpg`;
    const webpPath = `${baseOutputPath}.webp`;

    const ext = path.extname(inputPath).toLowerCase();

    if (ext === '.svg') {

      const svgPath = `${baseOutputPath}.svg`;
      await fs.copyFile(inputPath, svgPath);

      return { jpeg: svgPath, webp: svgPath };
    }

    if (ext === '.gif') {

      const metadata = await sharp(inputPath).metadata();

      if (metadata.pages && metadata.pages > 1) {
        const gifPath = `${baseOutputPath}.gif`;
        await fs.copyFile(inputPath, gifPath);

        return { jpeg: gifPath, webp: gifPath };
      }

    }

    if (ext === '.ico') {

      const icoPath = `${baseOutputPath}.ico`;
      await fs.copyFile(inputPath, icoPath);

      return { jpeg: icoPath, webp: icoPath };
    }

    const sharpInstance = sharp(inputPath)
      .resize(config.width, config.height, {
        fit: 'cover',
        position: 'center'
      });

    await sharpInstance
      .clone()
      .webp({ quality: webpQuality, effort: 4 })
      .toFile(webpPath);

    await sharpInstance
      .clone()
      .jpeg({ quality: config.quality, progressive: true })
      .toFile(jpegPath);

    return { jpeg: jpegPath, webp: webpPath };
  }

  

  static async createThumbnail(
    inputPath: string, 
    thumbnailPath: string
  ): Promise<{ jpeg: string; webp: string }> {
    return await this.processImage(inputPath, thumbnailPath, IMAGE_CONFIG.thumbnail);
  }

  

  static async processProfileImage(
    inputPath: string, 
    outputPath: string
  ): Promise<{ jpeg: string; webp: string }> {
    return await this.processImage(inputPath, outputPath, IMAGE_CONFIG.profile);
  }

  

  static async processCarImage(
    inputPath: string, 
    outputPath: string
  ): Promise<{ jpeg: string; webp: string }> {
    return await this.processImage(inputPath, outputPath, IMAGE_CONFIG.car);
  }

  static processImageAsync(
    inputPath: string,
    outputPath: string,
    thumbnailPath: string,
    config: { width: number; height: number; quality: number; webpQuality?: number },
    type: 'profile' | 'car',
    userId?: string
  ): string {
    const { imageProcessingQueue } = require('./image-processing-queue');
    
    const jobId = imageProcessingQueue.addJob({
      type,
      inputPath,
      outputPath,
      thumbnailPath,
      config,
      userId
    });

    return jobId;
  }

  static processProfileImageAsync(
    inputPath: string,
    outputPath: string,
    thumbnailPath: string,
    userId?: string
  ): string {
    return this.processImageAsync(
      inputPath,
      outputPath,
      thumbnailPath,
      IMAGE_CONFIG.profile,
      'profile',
      userId
    );
  }

  static processCarImageAsync(
    inputPath: string,
    outputPath: string,
    thumbnailPath: string
  ): string {
    return this.processImageAsync(
      inputPath,
      outputPath,
      thumbnailPath,
      IMAGE_CONFIG.car,
      'car'
    );
  }

  static async deleteImage(imagePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.unlink(imagePath);
      return { success: true };
    } catch (error: unknown) {

      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        console.warn(`Image file not found (already deleted): ${imagePath}`);
        return { success: true };
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

    const mainResult = await this.deleteImage(mainImagePath);
    const mainDeleted = mainResult.success;
    if (!mainResult.success && mainResult.error) {
      errors.push(`Main image: ${mainResult.error}`);
    }

    const filename = path.basename(mainImagePath);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);
    
    const thumbResult = await this.deleteImage(thumbnailPath);
    const thumbDeleted = thumbResult.success;
    if (!thumbResult.success && thumbResult.error) {
      errors.push(`Thumbnail: ${thumbResult.error}`);
    }

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
      return { success: true, errors: [] };
    }

    try {

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
      return { success: true, errors: [] };
    }

    try {

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

  

  static generateImageUrls(filename: string, type: 'profiles' | 'cars' | 'thumbs' = 'profiles'): { webp: string; jpeg: string; fallback: string } {
    const baseFilename = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    return {
      webp: `/uploads/${type}/${baseFilename}.webp`,
      jpeg: `/uploads/${type}/${baseFilename}.jpg`,
      fallback: `/uploads/${type}/${baseFilename}.jpg`
    };
  }

  /**
   * Legacy method - returns JPEG URL for backward compatibility
   */
  static generateImageUrl(filename: string, type: 'profiles' | 'cars' | 'thumbs' = 'profiles'): string {
    const baseFilename = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    return `/uploads/${type}/${baseFilename}.jpg`;
  }

  /**
   * Comprehensive security validation for uploaded files
   * Validates file content, magic numbers, MIME types, and sanitizes SVG files
   */
  static async validateUploadedFile(
    filePath: string,
    originalFilename: string,
    mimeType: string
  ): Promise<{ isValid: boolean; error?: string; securityIssue?: string }> {

    const sizeResult = await FileValidator.validateFileSize(filePath, IMAGE_CONFIG.maxFileSize);
    if (!sizeResult.isValid) {
      console.error(`[IMAGE_SECURITY] File size validation failed: ${sizeResult.error}`);
      await this.deleteImage(filePath);
      return sizeResult;
    }

    const validationResult = await FileValidator.validateUploadedFile(
      filePath,
      originalFilename,
      mimeType
    );
    
    if (!validationResult.isValid) {
      console.error(`[IMAGE_SECURITY] File validation failed: ${validationResult.error} (${validationResult.securityIssue})`);
      await this.deleteImage(filePath);
      return validationResult;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!['.svg', '.gif', '.ico'].includes(ext)) {
      try {
        const metadata = await sharp(filePath).metadata();
        
        if (!metadata.width || !metadata.height) {
          console.error('[IMAGE_SECURITY] Invalid image: no dimensions');
          await this.deleteImage(filePath);
          return {
            isValid: false,
            error: 'Invalid image file',
            securityIssue: 'NO_DIMENSIONS'
          };
        }

        if (metadata.width < 100 || metadata.height < 100) {
          console.error(`[IMAGE_SECURITY] Image too small: ${metadata.width}x${metadata.height}`);
          await this.deleteImage(filePath);
          return {
            isValid: false,
            error: 'Image dimensions too small (minimum 100x100 pixels)',
            securityIssue: 'DIMENSIONS_TOO_SMALL'
          };
        }

        if (metadata.width > 4000 || metadata.height > 4000) {
          console.error(`[IMAGE_SECURITY] Image too large: ${metadata.width}x${metadata.height}`);
          await this.deleteImage(filePath);
          return {
            isValid: false,
            error: 'Image dimensions too large (maximum 4000x4000 pixels)',
            securityIssue: 'DIMENSIONS_TOO_LARGE'
          };
        }
        
      } catch (error) {
        console.error('[IMAGE_SECURITY] Sharp validation failed:', error);
        await this.deleteImage(filePath);
        return {
          isValid: false,
          error: 'Unable to process image file',
          securityIssue: 'PROCESSING_FAILED'
        };
      }
    }
    
    return { isValid: true };
  }

  

  static async validateImage(filePath: string): Promise<boolean> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const filename = path.basename(filePath);

      const mimeTypeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
        '.ico': 'image/x-icon',
        '.avif': 'image/avif'
      };
      
      const mimeType = mimeTypeMap[ext] || 'application/octet-stream';
      
      const result = await this.validateUploadedFile(filePath, filename, mimeType);
      return result.isValid;
    } catch (error) {
      console.error('Image validation failed:', error);
      return false;
    }
  }
}

export const profileUpload = createMulterConfig('public/uploads/profiles');
export const carUpload = createMulterConfig('public/uploads/cars');
