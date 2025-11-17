import { promises as fs } from 'fs';
import path from 'path';
import sanitizeHtml from 'sanitize-html';

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  detectedType?: string;
  securityIssue?: string;
}

export interface MagicNumber {
  signature: number[];
  offset: number;
  mimeType: string;
  extensions: string[];
}

export const MAGIC_NUMBERS: Record<string, MagicNumber> = {
  JPEG: {
    signature: [0xFF, 0xD8, 0xFF],
    offset: 0,
    mimeType: 'image/jpeg',
    extensions: ['.jpg', '.jpeg']
  },
  PNG: {
    signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    offset: 0,
    mimeType: 'image/png',
    extensions: ['.png']
  },
  GIF_87a: {
    signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    offset: 0,
    mimeType: 'image/gif',
    extensions: ['.gif']
  },
  GIF_89a: {
    signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    offset: 0,
    mimeType: 'image/gif',
    extensions: ['.gif']
  },
  WEBP: {
    signature: [0x52, 0x49, 0x46, 0x46],
    offset: 0,
    mimeType: 'image/webp',
    extensions: ['.webp']
  },
  WEBP_SIGNATURE: {
    signature: [0x57, 0x45, 0x42, 0x50],
    offset: 8,
    mimeType: 'image/webp',
    extensions: ['.webp']
  },
  BMP: {
    signature: [0x42, 0x4D],
    offset: 0,
    mimeType: 'image/bmp',
    extensions: ['.bmp']
  },
  TIFF_LE: {
    signature: [0x49, 0x49, 0x2A, 0x00],
    offset: 0,
    mimeType: 'image/tiff',
    extensions: ['.tiff', '.tif']
  },
  TIFF_BE: {
    signature: [0x4D, 0x4D, 0x00, 0x2A],
    offset: 0,
    mimeType: 'image/tiff',
    extensions: ['.tiff', '.tif']
  },
  ICO: {
    signature: [0x00, 0x00, 0x01, 0x00],
    offset: 0,
    mimeType: 'image/x-icon',
    extensions: ['.ico']
  },
  AVIF: {
    signature: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
    offset: 4,
    mimeType: 'image/avif',
    extensions: ['.avif']
  }
};

export const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jse',
  '.wsf', '.wsh', '.msi', '.msp', '.hta', '.cpl', '.jar', '.app', '.deb',
  '.rpm', '.dmg', '.pkg', '.run', '.sh', '.bash', '.ps1', '.psm1', '.psd1',
  '.php', '.php3', '.php4', '.php5', '.phtml', '.asp', '.aspx', '.jsp',
  '.cgi', '.pl', '.py', '.rb', '.dll', '.so', '.dylib'
];

export class FileValidator {
  

  static async readMagicNumber(filePath: string, length: number = 12): Promise<Buffer> {
    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(length);
    
    try {
      await fileHandle.read(buffer, 0, length, 0);
      return buffer;
    } finally {
      await fileHandle.close();
    }
  }

  

  static matchesMagicNumber(buffer: Buffer, magicNumber: MagicNumber): boolean {
    const { signature, offset } = magicNumber;
    
    for (let i = 0; i < signature.length; i++) {
      if (buffer[offset + i] !== signature[i]) {
        return false;
      }
    }
    
    return true;
  }

  

  static async detectFileType(filePath: string): Promise<FileValidationResult> {
    try {
      const buffer = await this.readMagicNumber(filePath);
      
      for (const [type, magicNumber] of Object.entries(MAGIC_NUMBERS)) {
        if (this.matchesMagicNumber(buffer, magicNumber)) {

          if (type === 'WEBP') {

            const webpSignature = MAGIC_NUMBERS.WEBP_SIGNATURE;
            if (this.matchesMagicNumber(buffer, webpSignature)) {
              return {
                isValid: true,
                detectedType: magicNumber.mimeType
              };
            }

            continue;
          }
          
          return {
            isValid: true,
            detectedType: magicNumber.mimeType
          };
        }
      }

      console.warn(`[FILE_VALIDATOR] Unknown file signature: ${buffer.slice(0, 8).toString('hex')}`);
      return {
        isValid: false,
        error: 'Unable to verify file type from content',
        securityIssue: 'UNKNOWN_FILE_SIGNATURE'
      };
    } catch (error) {
      console.error('[FILE_VALIDATOR] Error reading file magic number:', error);
      return {
        isValid: false,
        error: 'Failed to read file content'
      };
    }
  }

  

  static validateDoubleExtension(filename: string): FileValidationResult {
    const parts = filename.toLowerCase().split('.');
    
    if (parts.length > 2) {
      for (let i = 1; i < parts.length - 1; i++) {
        const ext = '.' + parts[i];
        if (DANGEROUS_EXTENSIONS.includes(ext)) {
          console.warn(`[FILE_VALIDATOR] Double extension detected with dangerous extension: ${filename}`);
          return {
            isValid: false,
            error: 'Invalid file name: multiple extensions detected',
            securityIssue: 'DOUBLE_EXTENSION_DETECTED'
          };
        }
      }
    }
    
    const lastExt = '.' + parts[parts.length - 1];
    if (DANGEROUS_EXTENSIONS.includes(lastExt)) {
      console.warn(`[FILE_VALIDATOR] Dangerous extension detected: ${filename}`);
      return {
        isValid: false,
        error: 'Invalid file type: executable or script files are not allowed',
        securityIssue: 'DANGEROUS_EXTENSION'
      };
    }
    
    return { isValid: true };
  }

  

  static validateExtensionMatch(
    filename: string,
    detectedMimeType: string
  ): FileValidationResult {
    const ext = path.extname(filename).toLowerCase();
    
    for (const magicNumber of Object.values(MAGIC_NUMBERS)) {
      if (magicNumber.mimeType === detectedMimeType) {
        if (magicNumber.extensions.includes(ext)) {
          return { isValid: true };
        }
      }
    }
    
    console.warn(`[FILE_VALIDATOR] Extension mismatch: ${ext} does not match detected type ${detectedMimeType}`);
    return {
      isValid: false,
      error: 'File extension does not match file content',
      securityIssue: 'EXTENSION_MISMATCH'
    };
  }

  

  static validateMimeTypeMatch(
    claimedMimeType: string,
    detectedMimeType: string
  ): FileValidationResult {
    const normalizedClaimed = claimedMimeType.toLowerCase();
    const normalizedDetected = detectedMimeType.toLowerCase();
    
    if (normalizedClaimed === 'image/jpg') {
      if (normalizedDetected === 'image/jpeg') {
        return { isValid: true };
      }
    }
    
    if (normalizedClaimed === normalizedDetected) {
      return { isValid: true };
    }
    
    if (normalizedClaimed === 'image/vnd.microsoft.icon' && normalizedDetected === 'image/x-icon') {
      return { isValid: true };
    }
    
    console.warn(`[FILE_VALIDATOR] MIME type mismatch: claimed ${claimedMimeType} but detected ${detectedMimeType}`);
    return {
      isValid: false,
      error: 'File type does not match uploaded content',
      securityIssue: 'MIME_TYPE_SPOOFING'
    };
  }

  

  static async sanitizeSVG(filePath: string): Promise<FileValidationResult> {
    try {
      const svgContent = await fs.readFile(filePath, 'utf-8');
      
      const sanitized = sanitizeHtml(svgContent, {
        allowedTags: [
          'svg', 'g', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 
          'polygon', 'text', 'tspan', 'defs', 'clipPath', 'mask', 'pattern',
          'linearGradient', 'radialGradient', 'stop', 'use', 'symbol', 'title',
          'desc', 'metadata', 'style'
        ],
        allowedAttributes: {
          '*': [
            'id', 'class', 'style', 'transform', 'fill', 'stroke', 'stroke-width',
            'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity',
            'stroke-opacity', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy',
            'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'viewBox',
            'preserveAspectRatio', 'xmlns', 'xmlns:xlink', 'version'
          ],
          use: ['href', 'xlink:href'],
          linearGradient: ['gradientUnits', 'gradientTransform'],
          radialGradient: ['gradientUnits', 'gradientTransform'],
          stop: ['offset', 'stop-color', 'stop-opacity'],
          pattern: ['patternUnits', 'patternContentUnits', 'patternTransform']
        },
        allowedSchemes: ['data'],
        allowedSchemesByTag: {
          use: ['#']
        },
        allowedStyles: {
          '*': {
            'color': [/^[a-z]+$/i, /^#[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
            'fill': [/^[a-z]+$/i, /^#[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/, /^none$/],
            'stroke': [/^[a-z]+$/i, /^#[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/, /^none$/],
            'stroke-width': [/^\d+(?:px|em|%)?$/],
            'opacity': [/^[0-9.]+$/],
            'font-size': [/^\d+(?:px|em|pt|%)?$/],
            'font-family': [/^[\w\s,'-]+$/],
            'text-anchor': [/^(start|middle|end)$/]
          }
        },
        disallowedTagsMode: 'discard',
        parseStyleAttributes: true
      });
      
      if (!sanitized.includes('<svg')) {
        console.warn('[FILE_VALIDATOR] SVG sanitization removed all content');
        return {
          isValid: false,
          error: 'Invalid SVG file: no valid SVG content found',
          securityIssue: 'INVALID_SVG_CONTENT'
        };
      }
      
      const hasScript = svgContent.match(/<script|javascript:|on\w+\s*=/i);
      if (hasScript) {
        console.warn('[FILE_VALIDATOR] SVG contained potentially malicious content (sanitized)');
        await fs.writeFile(filePath, sanitized, 'utf-8');
        return {
          isValid: true,
          securityIssue: 'SVG_SANITIZED'
        };
      }
      
      await fs.writeFile(filePath, sanitized, 'utf-8');
      return { isValid: true };
    } catch (error) {
      console.error('[FILE_VALIDATOR] Error sanitizing SVG:', error);
      return {
        isValid: false,
        error: 'Failed to validate SVG content'
      };
    }
  }

  

  static async validateUploadedFile(
    filePath: string,
    originalFilename: string,
    mimeType: string
  ): Promise<FileValidationResult> {
    
    const doubleExtResult = this.validateDoubleExtension(originalFilename);
    if (!doubleExtResult.isValid) {
      return doubleExtResult;
    }
    
    const ext = path.extname(originalFilename).toLowerCase();
    
    if (ext === '.svg') {
      return await this.sanitizeSVG(filePath);
    }
    
    const detectionResult = await this.detectFileType(filePath);
    if (!detectionResult.isValid) {
      return detectionResult;
    }
    
    const detectedType = detectionResult.detectedType!;
    
    const mimeMatchResult = this.validateMimeTypeMatch(mimeType, detectedType);
    if (!mimeMatchResult.isValid) {
      return mimeMatchResult;
    }
    
    const extMatchResult = this.validateExtensionMatch(originalFilename, detectedType);
    if (!extMatchResult.isValid) {
      return extMatchResult;
    }
    
    return {
      isValid: true,
      detectedType
    };
  }

  

  static async validateFileSize(filePath: string, maxSize: number): Promise<FileValidationResult> {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size > maxSize) {
        console.warn(`[FILE_VALIDATOR] File too large: ${stats.size} bytes (max: ${maxSize})`);
        return {
          isValid: false,
          error: `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
        };
      }
      
      if (stats.size === 0) {
        console.warn('[FILE_VALIDATOR] Empty file detected');
        return {
          isValid: false,
          error: 'File is empty'
        };
      }
      
      return { isValid: true };
    } catch (error) {
      console.error('[FILE_VALIDATOR] Error checking file size:', error);
      return {
        isValid: false,
        error: 'Failed to check file size'
      };
    }
  }
}
