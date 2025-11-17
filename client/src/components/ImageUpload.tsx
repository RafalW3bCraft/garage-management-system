import { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ImageFile {
  file: File;
  preview: string;
  uploadProgress: number;
  uploadStatus: 'pending' | 'uploading' | 'processing' | 'success' | 'error';
  error?: string;
  url?: string;
  jobId?: string;
}

interface ImageUploadProps {
  

  uploadUrl: string;
  
  

  multiple?: boolean;
  
  

  maxFiles?: number;
  
  

  maxSize?: number;
  
  

  accept?: string;
  
  

  currentImages?: string[];
  
  

  onUploadComplete?: (urls: string[]) => void;
  
  

  onRemove?: (url: string) => void;
  
  

  className?: string;
  
  

  disabled?: boolean;
  
  

  fieldName?: string;

  

  label?: string;
}

export function ImageUpload({
  uploadUrl,
  multiple = false,
  maxFiles = 10,
  maxSize = 5 * 1024 * 1024, 
  accept = 'image/jpeg,image/jpg,image/png,image/webp',
  currentImages = [],
  onUploadComplete,
  onRemove,
  className,
  disabled = false,
  fieldName = 'image',
  label
}: ImageUploadProps) {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize) {
      return `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`;
    }

    const acceptedTypes = accept.split(',').map(t => t.trim());
    if (!acceptedTypes.includes(file.type)) {
      return 'Invalid file type. Only images are allowed';
    }

    return null;
  };

  const pollJobStatus = async (jobId: string, preview: string): Promise<void> => {
    const maxAttempts = 30;
    const pollInterval = 1000;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      if (attempts >= maxAttempts) {
        setImageFiles(prev =>
          prev.map(f =>
            f.preview === preview
              ? {
                  ...f,
                  uploadStatus: 'error',
                  error: 'Image processing timeout'
                }
              : f
          )
        );
        
        toast({
          title: 'Error',
          description: 'Image processing timeout. Please try again.',
          variant: 'destructive',
        });
        
        return;
      }

      try {
        const response = await fetch(`/api/upload/status/${jobId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.status) {
          throw new Error('Invalid response format');
        }

        if (data.status === 'completed') {
          const finalUrl = data.imageUrl || data.imageUrls?.fallback;
          
          if (!finalUrl) {
            setImageFiles(prev =>
              prev.map(f =>
                f.preview === preview
                  ? {
                      ...f,
                      uploadStatus: 'error',
                      error: 'Processing completed but no image URL provided'
                    }
                  : f
              )
            );

            toast({
              title: 'Error',
              description: 'Image processing failed. Please try again.',
              variant: 'destructive',
            });
            return;
          }
          
          setImageFiles(prev =>
            prev.map(f =>
              f.preview === preview
                ? {
                    ...f,
                    uploadStatus: 'success',
                    uploadProgress: 100,
                    url: finalUrl
                  }
                : f
            )
          );

          if (onUploadComplete) {
            onUploadComplete([finalUrl]);
          }

          toast({
            title: 'Success',
            description: 'Image uploaded successfully',
          });
        } else if (data.status === 'failed') {
          setImageFiles(prev =>
            prev.map(f =>
              f.preview === preview
                ? {
                    ...f,
                    uploadStatus: 'error',
                    error: data.error || 'Processing failed'
                  }
                : f
            )
          );

          toast({
            title: 'Error',
            description: data.error || 'Image processing failed',
            variant: 'destructive',
          });
        } else {
          attempts++;
          setTimeout(poll, pollInterval);
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          setImageFiles(prev =>
            prev.map(f =>
              f.preview === preview
                ? {
                    ...f,
                    uploadStatus: 'error',
                    error: 'Failed to check processing status'
                  }
                : f
            )
          );
          
          toast({
            title: 'Error',
            description: 'Failed to check upload status. Please try again.',
            variant: 'destructive',
          });
        } else {
          setTimeout(poll, pollInterval);
        }
      }
    };

    poll();
  };

  const uploadFile = async (imageFile: ImageFile): Promise<void> => {
    const formData = new FormData();
    formData.append(fieldName, imageFile.file);

    try {
      setImageFiles(prev =>
        prev.map(f =>
          f.preview === imageFile.preview
            ? { ...f, uploadStatus: 'uploading', uploadProgress: 0 }
            : f
        )
      );

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setImageFiles(prev =>
            prev.map(f =>
              f.preview === imageFile.preview
                ? { ...f, uploadProgress: progress }
                : f
            )
          );
        }
      });

      xhr.addEventListener('load', () => {
        try {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            
            if (response.processing && response.jobId) {
              setImageFiles(prev =>
                prev.map(f =>
                  f.preview === imageFile.preview
                    ? {
                        ...f,
                        uploadStatus: 'processing',
                        uploadProgress: 100,
                        jobId: response.jobId,
                        url: response.imageUrl
                      }
                    : f
                )
              );

              pollJobStatus(response.jobId, imageFile.preview);
            } else if (response.imageUrl || response.url) {
              const finalUrl = response.imageUrl || response.url;
              
              setImageFiles(prev =>
                prev.map(f =>
                  f.preview === imageFile.preview
                    ? {
                        ...f,
                        uploadStatus: 'success',
                        uploadProgress: 100,
                        url: finalUrl
                      }
                    : f
                )
              );

              if (onUploadComplete && finalUrl) {
                onUploadComplete([finalUrl]);
              }

              toast({
                title: 'Success',
                description: 'Image uploaded successfully',
              });
            } else {
              setImageFiles(prev =>
                prev.map(f =>
                  f.preview === imageFile.preview
                    ? {
                        ...f,
                        uploadStatus: 'error',
                        error: 'Server response missing required fields'
                      }
                    : f
                )
              );

              toast({
                title: 'Error',
                description: 'Invalid response from server',
                variant: 'destructive',
              });
            }
          } else {
            let errorMessage = 'Upload failed. Please try again.';
            
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              errorMessage = errorResponse.message || errorMessage;
            } catch {
            }

            setImageFiles(prev =>
              prev.map(f =>
                f.preview === imageFile.preview
                  ? {
                      ...f,
                      uploadStatus: 'error',
                      error: errorMessage
                    }
                  : f
              )
            );

            toast({
              title: 'Error',
              description: errorMessage,
              variant: 'destructive',
            });
          }
        } catch (error) {
          setImageFiles(prev =>
            prev.map(f =>
              f.preview === imageFile.preview
                ? {
                    ...f,
                    uploadStatus: 'error',
                    error: 'Failed to process server response'
                  }
                : f
            )
          );

          toast({
            title: 'Error',
            description: 'Failed to process server response',
            variant: 'destructive',
          });
        }
      });

      xhr.addEventListener('error', () => {
        setImageFiles(prev =>
          prev.map(f =>
            f.preview === imageFile.preview
              ? {
                  ...f,
                  uploadStatus: 'error',
                  error: 'Upload failed. Please try again.'
                }
              : f
          )
        );

        toast({
          title: 'Error',
          description: 'Failed to upload image',
          variant: 'destructive',
        });
      });

      xhr.open('POST', uploadUrl);
      xhr.send(formData);
    } catch (error) {
      setImageFiles(prev =>
        prev.map(f =>
          f.preview === imageFile.preview
            ? {
                ...f,
                uploadStatus: 'error',
                error: error instanceof Error ? error.message : 'Upload failed'
              }
            : f
        )
      );

      toast({
        title: 'Error',
        description: 'Failed to upload image',
        variant: 'destructive',
      });
    }
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const totalImages = currentImages.length + imageFiles.length;
      const remainingSlots = maxFiles - totalImages;

      if (!multiple && (totalImages > 0 || files.length > 1)) {
        toast({
          title: 'Error',
          description: 'Only one image is allowed',
          variant: 'destructive',
        });
        return;
      }

      if (multiple && files.length > remainingSlots) {
        toast({
          title: 'Error',
          description: `You can only upload ${remainingSlots} more image${remainingSlots !== 1 ? 's' : ''}`,
          variant: 'destructive',
        });
        return;
      }

      const newImageFiles: ImageFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const error = validateFile(file);

        if (error) {
          toast({
            title: 'Invalid file',
            description: `${file.name}: ${error}`,
            variant: 'destructive',
          });
          continue;
        }

        const preview = URL.createObjectURL(file);
        newImageFiles.push({
          file,
          preview,
          uploadProgress: 0,
          uploadStatus: 'pending',
        });
      }

      setImageFiles(prev => [...prev, ...newImageFiles]);

      
      for (const imageFile of newImageFiles) {
        await uploadFile(imageFile);
      }
    },
    [currentImages.length, imageFiles.length, maxFiles, multiple, toast, uploadUrl]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      
      e.target.value = '';
    },
    [handleFiles]
  );

  const removeImage = useCallback(
    (preview: string, url?: string) => {
      setImageFiles(prev => prev.filter(f => f.preview !== preview));
      URL.revokeObjectURL(preview);

      if (url && onRemove) {
        onRemove(url);
      }
    },
    [onRemove]
  );

  const removeCurrentImage = useCallback(
    (url: string) => {
      if (onRemove) {
        onRemove(url);
      }
    },
    [onRemove]
  );

  return (
    <div className={cn('space-y-4', className)}>
      {label && (
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label}
        </label>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
          isDragging && 'border-primary bg-primary/5',
          !isDragging && 'border-muted-foreground/25 hover:border-primary/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />

        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground mb-2">
          {multiple
            ? 'Drag and drop images here, or click to select'
            : 'Drag and drop an image here, or click to select'}
        </p>
        <p className="text-xs text-muted-foreground">
          {accept.split(',').map(t => t.split('/')[1]).join(', ').toUpperCase()} up to{' '}
          {Math.round(maxSize / 1024 / 1024)}MB
        </p>
      </div>

      {currentImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {currentImages.map((url, index) => (
            <div
              key={`current-${index}`}
              className="relative group aspect-square rounded-lg overflow-hidden border"
            >
              <img
                src={url}
                alt={`Current ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {!disabled && onRemove && (
                <button
                  type="button"
                  onClick={() => removeCurrentImage(url)}
                  className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {imageFiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {imageFiles.map((imageFile, index) => (
            <div
              key={imageFile.preview}
              className="relative group aspect-square rounded-lg overflow-hidden border"
            >
              <img
                src={imageFile.preview}
                alt={`Upload ${index + 1}`}
                className="w-full h-full object-cover"
              />

              {imageFile.uploadStatus === 'uploading' && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                  <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
                  <Progress value={imageFile.uploadProgress} className="w-3/4" />
                  <p className="text-white text-xs mt-2">{imageFile.uploadProgress}%</p>
                </div>
              )}

              {imageFile.uploadStatus === 'processing' && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                  <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
                  <p className="text-white text-xs mt-2">Processing...</p>
                </div>
              )}

              {imageFile.uploadStatus === 'error' && (
                <div className="absolute inset-0 bg-destructive/90 flex items-center justify-center">
                  <p className="text-destructive-foreground text-xs px-2 text-center">
                    {imageFile.error || 'Upload failed'}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => removeImage(imageFile.preview, imageFile.url)}
                className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
