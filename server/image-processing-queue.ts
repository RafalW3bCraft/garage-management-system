import crypto from 'crypto';
import { ImageService, IMAGE_CONFIG } from './image-service';
import { getStorage } from './storage';

export type JobType = 'profile' | 'car' | 'thumbnail';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ImageProcessingJob {
  id: string;
  type: JobType;
  status: JobStatus;
  inputPath: string;
  outputPath: string;
  thumbnailPath?: string;
  config: { width: number; height: number; quality: number; webpQuality?: number };
  userId?: string;
  carId?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  result?: {
    imageUrl: string;
    imageUrls: { jpeg: string; webp: string; fallback: string };
    thumbnailUrls?: { jpeg: string; webp: string; fallback: string };
  };
}

class ImageProcessingQueue {
  private static instance: ImageProcessingQueue;
  private jobs: Map<string, ImageProcessingJob>;
  private queue: string[];
  private processing: boolean;
  private maxRetries: number = 1;

  private constructor() {
    this.jobs = new Map();
    this.queue = [];
    this.processing = false;
    this.startWorker();
  }

  static getInstance(): ImageProcessingQueue {
    if (!ImageProcessingQueue.instance) {
      ImageProcessingQueue.instance = new ImageProcessingQueue();
    }
    return ImageProcessingQueue.instance;
  }

  addJob(params: {
    type: JobType;
    inputPath: string;
    outputPath: string;
    thumbnailPath?: string;
    config: { width: number; height: number; quality: number; webpQuality?: number };
    userId?: string;
    carId?: string;
  }): string {
    const jobId = crypto.randomUUID();
    
    const job: ImageProcessingJob = {
      id: jobId,
      type: params.type,
      status: 'pending',
      inputPath: params.inputPath,
      outputPath: params.outputPath,
      thumbnailPath: params.thumbnailPath,
      config: params.config,
      userId: params.userId,
      carId: params.carId,
      createdAt: new Date(),
      retryCount: 0
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);

    this.processNextJob();

    return jobId;
  }

  getJobStatus(jobId: string): ImageProcessingJob | undefined {
    return this.jobs.get(jobId);
  }

  private startWorker(): void {
  }

  private async processNextJob(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const jobId = this.queue.shift();

    if (!jobId) {
      this.processing = false;
      return;
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      console.error(`[IMAGE_QUEUE] Job ${jobId} not found in jobs map`);
      this.processing = false;
      this.processNextJob();
      return;
    }

    await this.processJob(job);

    this.processing = false;
    this.processNextJob();
  }

  private async processJob(job: ImageProcessingJob): Promise<void> {
    const startTime = Date.now();
    job.status = 'processing';
    job.startedAt = new Date();

    try {
      let processedImages: { jpeg: string; webp: string };
      let thumbnails: { jpeg: string; webp: string } | undefined;

      switch (job.type) {
        case 'profile':
          processedImages = await ImageService.processProfileImage(job.inputPath, job.outputPath);
          if (job.thumbnailPath) {
            thumbnails = await ImageService.createThumbnail(processedImages.jpeg, job.thumbnailPath);
          }
          break;

        case 'car':
          processedImages = await ImageService.processCarImage(job.inputPath, job.outputPath);
          if (job.thumbnailPath) {
            thumbnails = await ImageService.createThumbnail(processedImages.jpeg, job.thumbnailPath);
          }
          break;

        case 'thumbnail':
          processedImages = await ImageService.createThumbnail(job.inputPath, job.outputPath);
          break;

        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      const filename = job.outputPath.split('/').pop()?.replace(/\.(jpg|jpeg|png|webp)$/i, '') || '';
      const imageType = job.type === 'profile' ? 'profiles' : 'cars';
      
      const imageUrls = ImageService.generateImageUrls(filename, imageType);
      const imageUrl = ImageService.generateImageUrl(filename, imageType);

      let thumbnailUrls;
      if (thumbnails && job.thumbnailPath) {
        const thumbFilename = job.thumbnailPath.split('/').pop()?.replace(/\.(jpg|jpeg|png|webp)$/i, '') || '';
        thumbnailUrls = ImageService.generateImageUrls(thumbFilename, 'thumbs');
      }

      job.result = {
        imageUrl,
        imageUrls,
        thumbnailUrls
      };

      if (job.userId && job.type === 'profile') {
        try {
          const storage = await getStorage();
          await storage.updateUser(job.userId, { profileImage: imageUrl });
        } catch (error) {
          console.error(`[IMAGE_QUEUE] Failed to update user profile image in database:`, error);
        }
      }

      await ImageService.deleteImage(job.inputPath);

      job.status = 'completed';
      job.completedAt = new Date();

      const duration = Date.now() - startTime;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[IMAGE_QUEUE] ❌ Job ${job.id} failed after ${duration}ms (attempt ${job.retryCount + 1}/${this.maxRetries + 1}):`, error);

      job.retryCount++;

      if (job.retryCount <= this.maxRetries) {
        job.status = 'pending';
        this.queue.push(job.id);
      } else {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.completedAt = new Date();
        console.error(`[IMAGE_QUEUE] 🛑 Job ${job.id} failed permanently after ${this.maxRetries + 1} attempts`);
      }
    }
  }

  getQueueStats(): {
    totalJobs: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    queueLength: number;
  } {
    const stats = {
      totalJobs: this.jobs.size,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      queueLength: this.queue.length
    };

    for (const job of Array.from(this.jobs.values())) {
      if (job.status === 'pending') stats.pending++;
      else if (job.status === 'processing') stats.processing++;
      else if (job.status === 'completed') stats.completed++;
      else if (job.status === 'failed') stats.failed++;
    }

    return stats;
  }

  clearOldJobs(olderThanMs: number = 3600000): number {
    const cutoffTime = Date.now() - olderThanMs;
    let cleared = 0;

    for (const [jobId, job] of Array.from(this.jobs.entries())) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        job.completedAt.getTime() < cutoffTime
      ) {
        this.jobs.delete(jobId);
        cleared++;
      }
    }

    if (cleared > 0) {
    }

    return cleared;
  }
}

export const imageProcessingQueue = ImageProcessingQueue.getInstance();

setInterval(() => {
  imageProcessingQueue.clearOldJobs(3600000);
}, 600000);
