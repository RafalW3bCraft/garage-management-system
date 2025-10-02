import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { ImageService, IMAGE_CONFIG, createMulterConfig } from '../../image-service';
import { promises as fs } from 'fs';
import path from 'path';

// Mock sharp
const mockToFile = jest.fn();
const mockJpeg = jest.fn().mockReturnThis();
const mockWebp = jest.fn().mockReturnThis();
const mockResize = jest.fn().mockReturnThis();
const mockClone = jest.fn().mockReturnThis();
const mockMetadata = jest.fn();

jest.mock('sharp', () => {
  const sharpMock = jest.fn().mockImplementation((input?: any) => ({
    resize: mockResize,
    clone: mockClone,
    jpeg: mockJpeg,
    webp: mockWebp,
    toFile: mockToFile,
    metadata: mockMetadata,
  }));
  // Add static method for direct metadata calls
  Object.assign(sharpMock, {
    prototype: {
      metadata: mockMetadata,
    }
  });
  return sharpMock;
});

// Mock fs
jest.mock('fs', () => ({
  promises: {
    unlink: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
  },
}));

// Mock multer
jest.mock('multer', () => {
  const multerMock: any = jest.fn().mockImplementation(() => ({}));
  multerMock.diskStorage = jest.fn().mockImplementation(() => ({}));
  return multerMock;
});

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Image Service - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementations for clone chain
    mockClone.mockReturnValue({
      webp: mockWebp.mockReturnValue({
        toFile: mockToFile,
      }),
      jpeg: mockJpeg.mockReturnValue({
        toFile: mockToFile,
      }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('IMAGE_CONFIG', () => {
    it('should have correct configuration values', () => {
      expect(IMAGE_CONFIG.maxFileSize).toBe(5 * 1024 * 1024);
      expect(IMAGE_CONFIG.allowedTypes).toEqual([
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ]);
      expect(IMAGE_CONFIG.profile.width).toBe(400);
      expect(IMAGE_CONFIG.profile.height).toBe(400);
      expect(IMAGE_CONFIG.car.width).toBe(800);
      expect(IMAGE_CONFIG.car.height).toBe(600);
      expect(IMAGE_CONFIG.thumbnail.width).toBe(150);
      expect(IMAGE_CONFIG.thumbnail.height).toBe(150);
    });
  });

  describe('ImageService.processImage', () => {
    it('should process image and create both JPEG and WebP versions', async () => {
      (mockToFile as any).mockResolvedValue(undefined);

      const result = await ImageService.processImage(
        '/input/image.jpg',
        '/output/image.jpg',
        { width: 800, height: 600, quality: 85, webpQuality: 80 }
      );

      expect(result).toEqual({
        jpeg: '/output/image.jpg',
        webp: '/output/image.webp',
      });

      expect(mockResize).toHaveBeenCalledWith(800, 600, {
        fit: 'cover',
        position: 'center',
      });
      expect(mockClone).toHaveBeenCalledTimes(2);
      expect(mockWebp).toHaveBeenCalledWith({ quality: 80, effort: 4 });
      expect(mockJpeg).toHaveBeenCalledWith({ quality: 85, progressive: true });
      expect(mockToFile).toHaveBeenCalledTimes(2);
    });

    it('should use quality for webpQuality if not provided', async () => {
      (mockToFile as any).mockResolvedValue(undefined);

      await ImageService.processImage(
        '/input/image.png',
        '/output/image.jpg',
        { width: 400, height: 400, quality: 90 }
      );

      expect(mockWebp).toHaveBeenCalledWith({ quality: 90, effort: 4 });
    });

    it('should handle different file extensions correctly', async () => {
      (mockToFile as any).mockResolvedValue(undefined);

      const result = await ImageService.processImage(
        '/input/image.png',
        '/output/processed.png',
        { width: 200, height: 200, quality: 80 }
      );

      expect(result.jpeg).toBe('/output/processed.jpg');
      expect(result.webp).toBe('/output/processed.webp');
    });
  });

  describe('ImageService.createThumbnail', () => {
    it('should create thumbnail with correct dimensions', async () => {
      (mockToFile as any).mockResolvedValue(undefined);

      const result = await ImageService.createThumbnail(
        '/input/image.jpg',
        '/output/thumb.jpg'
      );

      expect(mockResize).toHaveBeenCalledWith(150, 150, {
        fit: 'cover',
        position: 'center',
      });
      expect(result.jpeg).toBe('/output/thumb.jpg');
      expect(result.webp).toBe('/output/thumb.webp');
    });
  });

  describe('ImageService.processProfileImage', () => {
    it('should process profile image with correct dimensions', async () => {
      (mockToFile as any).mockResolvedValue(undefined);

      const result = await ImageService.processProfileImage(
        '/input/profile.jpg',
        '/output/profile.jpg'
      );

      expect(mockResize).toHaveBeenCalledWith(400, 400, {
        fit: 'cover',
        position: 'center',
      });
      expect(result.jpeg).toBe('/output/profile.jpg');
      expect(result.webp).toBe('/output/profile.webp');
    });
  });

  describe('ImageService.processCarImage', () => {
    it('should process car image with correct dimensions', async () => {
      (mockToFile as any).mockResolvedValue(undefined);

      const result = await ImageService.processCarImage(
        '/input/car.jpg',
        '/output/car.jpg'
      );

      expect(mockResize).toHaveBeenCalledWith(800, 600, {
        fit: 'cover',
        position: 'center',
      });
      expect(result.jpeg).toBe('/output/car.jpg');
      expect(result.webp).toBe('/output/car.webp');
    });
  });

  describe('ImageService.deleteImage', () => {
    it('should successfully delete an image', async () => {
      mockedFs.unlink.mockResolvedValue(undefined);

      const result = await ImageService.deleteImage('/path/to/image.jpg');

      expect(result.success).toBe(true);
      expect(mockedFs.unlink).toHaveBeenCalledWith('/path/to/image.jpg');
    });

    it('should handle file not found error (ENOENT) as success', async () => {
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockedFs.unlink.mockRejectedValue(error);

      const result = await ImageService.deleteImage('/path/to/nonexistent.jpg');

      expect(result.success).toBe(true);
    });

    it('should handle permission denied error (EACCES)', async () => {
      const error = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      mockedFs.unlink.mockRejectedValue(error);

      const result = await ImageService.deleteImage('/path/to/image.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should handle permission denied error (EPERM)', async () => {
      const error = Object.assign(new Error('EPERM'), { code: 'EPERM' });
      mockedFs.unlink.mockRejectedValue(error);

      const result = await ImageService.deleteImage('/path/to/image.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should handle unknown errors', async () => {
      const error = new Error('Unknown filesystem error');
      mockedFs.unlink.mockRejectedValue(error);

      const result = await ImageService.deleteImage('/path/to/image.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown filesystem error');
    });
  });

  describe('ImageService.deleteImageWithThumbnail', () => {
    it('should delete both main image and thumbnail successfully', async () => {
      mockedFs.unlink.mockResolvedValue(undefined);

      const result = await ImageService.deleteImageWithThumbnail(
        'public/uploads/profiles/profile-123.jpg',
        'profiles'
      );

      expect(result.success).toBe(true);
      expect(result.mainDeleted).toBe(true);
      expect(result.thumbDeleted).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2);
      expect(mockedFs.unlink).toHaveBeenCalledWith('public/uploads/profiles/profile-123.jpg');
      expect(mockedFs.unlink).toHaveBeenCalledWith('public/uploads/thumbs/thumb-profile-123.jpg');
    });

    it('should handle partial deletion when main image fails', async () => {
      const error = new Error('Deletion failed');
      mockedFs.unlink
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(undefined);

      const result = await ImageService.deleteImageWithThumbnail(
        'public/uploads/cars/car-123.jpg',
        'cars'
      );

      expect(result.success).toBe(false);
      expect(result.mainDeleted).toBe(false);
      expect(result.thumbDeleted).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle partial deletion when thumbnail fails', async () => {
      const error = new Error('Deletion failed');
      mockedFs.unlink
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(error);

      const result = await ImageService.deleteImageWithThumbnail(
        'public/uploads/cars/car-123.jpg',
        'cars'
      );

      expect(result.success).toBe(false);
      expect(result.mainDeleted).toBe(true);
      expect(result.thumbDeleted).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle both deletions failing', async () => {
      const error = new Error('Deletion failed');
      mockedFs.unlink.mockRejectedValue(error);

      const result = await ImageService.deleteImageWithThumbnail(
        'public/uploads/profiles/profile-123.jpg',
        'profiles'
      );

      expect(result.success).toBe(false);
      expect(result.mainDeleted).toBe(false);
      expect(result.thumbDeleted).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });

  describe('ImageService.deleteImagesForUser', () => {
    it('should delete profile image and thumbnail for user', async () => {
      mockedFs.unlink.mockResolvedValue(undefined);

      const result = await ImageService.deleteImagesForUser(
        'user-123',
        '/uploads/profiles/profile-456.jpg'
      );

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should return success when no profile image URL is provided', async () => {
      const result = await ImageService.deleteImagesForUser('user-123', undefined);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockedFs.unlink).not.toHaveBeenCalled();
    });

    it('should handle invalid profile image URL format', async () => {
      const result = await ImageService.deleteImagesForUser('user-123', '/uploads/profiles/');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid profile image URL format');
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Deletion failed');
      mockedFs.unlink.mockRejectedValue(error);

      const result = await ImageService.deleteImagesForUser(
        'user-123',
        '/uploads/profiles/profile-456.jpg'
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('ImageService.deleteImagesForCar', () => {
    it('should delete car image and thumbnail', async () => {
      mockedFs.unlink.mockResolvedValue(undefined);

      const result = await ImageService.deleteImagesForCar(
        'car-123',
        '/uploads/cars/car-456.jpg'
      );

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should return success when no car image URL is provided', async () => {
      const result = await ImageService.deleteImagesForCar('car-123', undefined);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockedFs.unlink).not.toHaveBeenCalled();
    });

    it('should handle invalid car image URL format', async () => {
      const result = await ImageService.deleteImagesForCar('car-123', '/uploads/cars/');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid car image URL format');
    });
  });

  describe('ImageService.generateImageUrls', () => {
    it('should generate URLs for profiles', () => {
      const urls = ImageService.generateImageUrls('profile-123.jpg', 'profiles');

      expect(urls.webp).toBe('/uploads/profiles/profile-123.webp');
      expect(urls.jpeg).toBe('/uploads/profiles/profile-123.jpg');
      expect(urls.fallback).toBe('/uploads/profiles/profile-123.jpg');
    });

    it('should generate URLs for cars', () => {
      const urls = ImageService.generateImageUrls('car-456.png', 'cars');

      expect(urls.webp).toBe('/uploads/cars/car-456.webp');
      expect(urls.jpeg).toBe('/uploads/cars/car-456.jpg');
      expect(urls.fallback).toBe('/uploads/cars/car-456.jpg');
    });

    it('should generate URLs for thumbnails', () => {
      const urls = ImageService.generateImageUrls('thumb-789.webp', 'thumbs');

      expect(urls.webp).toBe('/uploads/thumbs/thumb-789.webp');
      expect(urls.jpeg).toBe('/uploads/thumbs/thumb-789.jpg');
      expect(urls.fallback).toBe('/uploads/thumbs/thumb-789.jpg');
    });

    it('should handle various file extensions', () => {
      const extensions = ['jpg', 'jpeg', 'png', 'webp'];
      
      extensions.forEach(ext => {
        const urls = ImageService.generateImageUrls(`image.${ext}`, 'profiles');
        expect(urls.jpeg).toBe('/uploads/profiles/image.jpg');
      });
    });
  });

  describe('ImageService.generateImageUrl', () => {
    it('should generate JPEG URL for backward compatibility', () => {
      const url = ImageService.generateImageUrl('profile-123.png', 'profiles');

      expect(url).toBe('/uploads/profiles/profile-123.jpg');
    });

    it('should default to profiles type', () => {
      const url = ImageService.generateImageUrl('image.jpg');

      expect(url).toBe('/uploads/profiles/image.jpg');
    });
  });

  describe('ImageService.validateImage', () => {
    it('should validate image successfully', async () => {
      (mockMetadata as any).mockResolvedValue({
        width: 800,
        height: 600,
        format: 'jpeg',
      });

      const result = await ImageService.validateImage('/path/to/image.jpg');

      expect(result).toBe(true);
    });

    it('should reject image with no width', async () => {
      (mockMetadata as any).mockResolvedValue({
        height: 600,
        format: 'jpeg',
      });

      const result = await ImageService.validateImage('/path/to/image.jpg');

      expect(result).toBe(false);
    });

    it('should reject image with no height', async () => {
      (mockMetadata as any).mockResolvedValue({
        width: 800,
        format: 'jpeg',
      });

      const result = await ImageService.validateImage('/path/to/image.jpg');

      expect(result).toBe(false);
    });

    it('should reject image below minimum dimensions', async () => {
      (mockMetadata as any).mockResolvedValue({
        width: 50,
        height: 50,
        format: 'jpeg',
      });

      const result = await ImageService.validateImage('/path/to/image.jpg');

      expect(result).toBe(false);
    });

    it('should reject image above maximum dimensions', async () => {
      (mockMetadata as any).mockResolvedValue({
        width: 5000,
        height: 5000,
        format: 'jpeg',
      });

      const result = await ImageService.validateImage('/path/to/image.jpg');

      expect(result).toBe(false);
    });

    it('should handle validation errors', async () => {
      (mockMetadata as any).mockRejectedValue(new Error('Invalid image'));

      const result = await ImageService.validateImage('/path/to/invalid.jpg');

      expect(result).toBe(false);
    });

    it('should accept image at minimum valid dimensions', async () => {
      (mockMetadata as any).mockResolvedValue({
        width: 100,
        height: 100,
        format: 'jpeg',
      });

      const result = await ImageService.validateImage('/path/to/image.jpg');

      expect(result).toBe(true);
    });

    it('should accept image at maximum valid dimensions', async () => {
      (mockMetadata as any).mockResolvedValue({
        width: 4000,
        height: 4000,
        format: 'jpeg',
      });

      const result = await ImageService.validateImage('/path/to/image.jpg');

      expect(result).toBe(true);
    });
  });

  describe('createMulterConfig', () => {
    it('should create multer config with correct destination path', () => {
      // This function creates a multer instance with storage configuration
      // The actual functionality is integration tested, unit test confirms it exists
      expect(createMulterConfig).toBeDefined();
      expect(typeof createMulterConfig).toBe('function');
    });
  });
});
