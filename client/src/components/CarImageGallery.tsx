import { useState } from 'react';
import { GripVertical, Star, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import type { CarImage } from '@shared/schema';

interface CarImageGalleryProps {
  images: CarImage[];
  onReorder?: (images: CarImage[]) => void;
  onSetPrimary?: (imageId: string) => void;
  onDelete?: (imageId: string) => void;
  readonly?: boolean;
}

export function CarImageGallery({
  images,
  onReorder,
  onSetPrimary,
  onDelete,
  readonly = false
}: CarImageGalleryProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const sortedImages = [...images].sort((a, b) => a.displayOrder - b.displayOrder);
  const primaryImage = sortedImages.find(img => img.isPrimary);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (readonly) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (readonly) return;
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    if (readonly) return;
    e.preventDefault();
    setDragOverIndex(null);

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const reorderedImages = [...sortedImages];
    const [draggedImage] = reorderedImages.splice(draggedIndex, 1);
    reorderedImages.splice(dropIndex, 0, draggedImage);

    const updatedImages = reorderedImages.map((img, idx) => ({
      ...img,
      displayOrder: idx
    }));

    if (onReorder) {
      onReorder(updatedImages);
    }

    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const openViewer = (index: number) => {
    setCurrentImageIndex(index);
    setViewerOpen(true);
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % sortedImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + sortedImages.length) % sortedImages.length);
  };

  if (sortedImages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No images uploaded yet
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {sortedImages.map((image, index) => (
          <div
            key={image.id}
            draggable={!readonly}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={cn(
              'relative group aspect-square rounded-lg overflow-hidden border-2 transition-all',
              draggedIndex === index && 'opacity-50',
              dragOverIndex === index && 'border-primary scale-105',
              !readonly && 'cursor-move',
              image.isPrimary && 'border-primary ring-2 ring-primary ring-offset-2'
            )}
          >
            <img
              src={image.imageUrl}
              alt={`Car image ${index + 1}`}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => openViewer(index)}
            />

            {image.isPrimary && (
              <Badge className="absolute top-2 left-2 bg-primary">
                <Star className="w-3 h-3 mr-1 fill-current" />
                Primary
              </Badge>
            )}

            {!readonly && (
              <div className="absolute top-2 right-2 p-1 bg-background/80 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4" />
              </div>
            )}

            {!readonly && (
              <div className="absolute bottom-2 left-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {!image.isPrimary && onSetPrimary && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetPrimary(image.id);
                    }}
                    className="flex-1 h-8 text-xs"
                  >
                    <Star className="w-3 h-3 mr-1" />
                    Set Primary
                  </Button>
                )}
                {onDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 px-2"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Image</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this image? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(image.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-4xl p-0">
          <div className="relative bg-black">
            <button
              onClick={() => setViewerOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {sortedImages.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            <div className="flex items-center justify-center min-h-[60vh] max-h-[80vh]">
              <img
                src={sortedImages[currentImageIndex]?.imageUrl}
                alt={`Car image ${currentImageIndex + 1}`}
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 text-white text-sm rounded-full">
              {currentImageIndex + 1} / {sortedImages.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
