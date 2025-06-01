"use client";

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import NextImage from 'next/image';
import { recommendCompressionSetting } from '@/ai/flows/recommend-compression-setting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, Trash2, Loader2, Sparkles, Download, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

interface ImageDimensions {
  width: number;
  height: number;
}

interface AIRecommendation {
  setting: number;
  reasoning: string;
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getImageDimensionsFromFile(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

async function compressToTargetFileSize(
  originalImageDataUrl: string,
  originalMimeType: string,
  originalSizeBytes: number,
  targetPercentage: number
): Promise<{ dataUrl: string; size: number; finalQualitySetting: number }> {
  const targetSizeBytes = originalSizeBytes * (targetPercentage / 100);

  if (originalMimeType === 'image/png' && targetPercentage >= 99.5) {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to get canvas context'));
        ctx.drawImage(img, 0, 0);
        const outputMimeType = 'image/png';
        const compressedDataUrl = canvas.toDataURL(outputMimeType);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Failed to convert canvas to blob for PNG'));
            resolve({ dataUrl: compressedDataUrl, size: blob.size, finalQualitySetting: 100 });
          },
          outputMimeType
        );
      };
      img.onerror = (err) => reject(err);
      img.src = originalImageDataUrl;
    });
  }

  let lowQuality = 0.01;
  let highQuality = 1.0;
  const MAX_ITERATIONS = 8;
  let bestResult = { dataUrl: originalImageDataUrl, size: originalSizeBytes, finalQualitySetting: 100 };
  let currentQualityForJpeg = Math.max(0.01, Math.min(1.0, (targetPercentage / 100) * 0.9 + 0.1)); 

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const qualityToTry = (i === 0 && originalMimeType !== 'image/png') ? currentQualityForJpeg : (lowQuality + highQuality) / 2;
    if (Math.abs(highQuality - lowQuality) < 0.01 && i > 0) break;

    const result = await new Promise<{ dataUrl: string; size: number }>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to get canvas context'));
        ctx.drawImage(img, 0, 0);
        const outputMimeType = 'image/jpeg';
        const compressedDataUrl = canvas.toDataURL(outputMimeType, qualityToTry);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Failed to convert canvas to blob for JPEG'));
            resolve({ dataUrl: compressedDataUrl, size: blob.size });
          },
          outputMimeType,
          qualityToTry
        );
      };
      img.onerror = (err) => reject(err);
      img.src = originalImageDataUrl;
    });
    
    const currentSizeIsCloserAndUnderTarget = result.size <= targetSizeBytes && (bestResult.size > targetSizeBytes || result.size > bestResult.size);
    const currentSizeIsBestOverTarget = result.size > targetSizeBytes && (bestResult.size > targetSizeBytes && result.size < bestResult.size);

    if (currentSizeIsCloserAndUnderTarget || currentSizeIsBestOverTarget) {
        bestResult = { dataUrl: result.dataUrl, size: result.size, finalQualitySetting: Math.round(qualityToTry * 100) };
    } else if (i === 0 && result.size > targetSizeBytes && bestResult.size === originalSizeBytes) { 
        bestResult = { dataUrl: result.dataUrl, size: result.size, finalQualitySetting: Math.round(qualityToTry * 100) };
    }
    
    if (bestResult.size <= targetSizeBytes && Math.abs(bestResult.size - targetSizeBytes) < originalSizeBytes * 0.02) {
        break;
    }

    if (result.size < targetSizeBytes) {
      lowQuality = qualityToTry;
    } else {
      highQuality = qualityToTry;
    }
    currentQualityForJpeg = (lowQuality + highQuality) / 2;
  }
  return bestResult;
}


export function ShrinkWrapApp() {
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
  const [originalImageDataUrl, setOriginalImageDataUrl] = useState<string | null>(null);
  const [originalImageDimensions, setOriginalImageDimensions] = useState<ImageDimensions | null>(null);
  const [originalImageSize, setOriginalImageSize] = useState<number | null>(null);
  
  const [targetFilePercentage, setTargetFilePercentage] = useState<number>(80);
  const [compressedImagePreviewUrl, setCompressedImagePreviewUrl] = useState<string | null>(null);
  const [compressedImageSize, setCompressedImageSize] = useState<number | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();

  const clearImageData = useCallback(() => {
    setOriginalImageFile(null);
    setOriginalImageDataUrl(null);
    setOriginalImageDimensions(null);
    setOriginalImageSize(null);
    setCompressedImagePreviewUrl(null);
    setCompressedImageSize(null);
    setAiRecommendation(null);
    setError(null);
    setTargetFilePercentage(80);
  }, []);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    clearImageData();
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({ title: 'Invalid File Type', description: 'Please upload a JPG, PNG, or WEBP image.', variant: 'destructive' });
      setError('Invalid file type. Please upload JPG, PNG, or WEBP.');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    try {
      setOriginalImageFile(file);
      setOriginalImageSize(file.size);
      
      const dimensions = await getImageDimensionsFromFile(file);
      setOriginalImageDimensions(dimensions);
      
      const dataUrl = await fileToDataURL(file);
      setOriginalImageDataUrl(dataUrl);
      
    } catch (err) {
      console.error('Error processing upload:', err);
      toast({ title: 'Upload Error', description: 'Could not process the uploaded image.', variant: 'destructive' });
      setError('Failed to process image. Please try another file.');
      clearImageData();
    } finally {
      setIsProcessing(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };
  
  const compressAndSet = useCallback(async (
    imgDataUrl: string,
    imgOriginalType: string,
    imgOriginalSize: number,
    percentage: number,
    dimensions: ImageDimensions | null
  ) => {
    if (!imgDataUrl || !dimensions || imgOriginalSize === null) return;
    setIsProcessing(true);
    setError(null);
    try {
      const { dataUrl: compressedUrl, size: compressedSizeBytes } = await compressToTargetFileSize(
        imgDataUrl,
        imgOriginalType,
        imgOriginalSize,
        percentage
      );
      setCompressedImagePreviewUrl(compressedUrl);
      setCompressedImageSize(compressedSizeBytes);
    } catch (err) {
      console.error('Error compressing image:', err);
      toast({ title: 'Compression Error', description: 'Could not generate compressed preview.', variant: 'destructive' });
      setError('Failed to generate compressed preview.');
      setCompressedImagePreviewUrl(null);
      setCompressedImageSize(null);
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (originalImageDataUrl && originalImageFile && originalImageDimensions && originalImageSize !== null) {
      compressAndSet(originalImageDataUrl, originalImageFile.type, originalImageSize, targetFilePercentage, originalImageDimensions);
    }
  }, [originalImageDataUrl, targetFilePercentage, originalImageFile, originalImageDimensions, originalImageSize, compressAndSet]);


  const handleGetAIRecommendation = async () => {
    if (!originalImageDataUrl) {
      toast({ title: 'No Image', description: 'Please upload an image first.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    setAiRecommendation(null);
    setError(null);
    try {
      const result = await recommendCompressionSetting({ photoDataUri: originalImageDataUrl });
      setAiRecommendation({ setting: result.targetSizePercentage, reasoning: result.reasoning });
      setTargetFilePercentage(result.targetSizePercentage);
      toast({ title: 'AI Suggestion Received', description: `Recommended target size: ${result.targetSizePercentage}%. Applied.` });
    } catch (err) {
      console.error('AI Recommendation Error:', err);
      toast({ title: 'AI Error', description: 'Could not get AI recommendation.', variant: 'destructive' });
      setError('Failed to get AI recommendation.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!compressedImagePreviewUrl || !originalImageFile) return;
    const link = document.createElement('a');
    link.href = compressedImagePreviewUrl;

    let fileExtension = '.jpg';
    if (compressedImagePreviewUrl.startsWith('data:image/png')) {
        fileExtension = '.png';
    }
    
    const baseName = originalImageFile.name.substring(0, originalImageFile.name.lastIndexOf('.')) || originalImageFile.name;
    link.download = `${baseName}_compressed_target_${targetFilePercentage}pct${fileExtension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Download Started', description: 'Your compressed image is downloading.' });
  };

  const calculateSavings = () => {
    if (originalImageSize && compressedImageSize && originalImageSize > 0 && compressedImageSize < originalImageSize) {
      const savings = ((originalImageSize - compressedImageSize) / originalImageSize) * 100;
      return savings.toFixed(1);
    }
    return '0.0';
  };

  const imagePreviewMaxWidth = 320;

  const buttonBaseClass = "bg-transparent border border-[hsl(var(--primary-action-border))] text-[hsl(var(--primary-action-text))] hover:bg-[hsl(var(--primary-action-hover-bg))] hover:text-[hsl(var(--primary-action-hover-text))] transition-colors duration-150 ease-in-out text-sm sm:text-base py-2 sm:py-3 px-4 sm:px-6 rounded-md font-semibold";
  const aiButtonClass = "bg-transparent border border-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent))] hover:text-background transition-colors duration-150 ease-in-out text-sm sm:text-base py-2 sm:py-3 px-4 sm:px-6 rounded-md font-semibold";
  const removeButtonClass = "bg-transparent border border-muted-foreground/70 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground transition-colors duration-150 ease-in-out text-sm sm:text-base py-2 sm:py-3 px-4 sm:px-6 rounded-md";


  return (
    <Card className="w-full bg-card border border-border/80 shadow-2xl rounded-lg p-0">
      <CardContent className="space-y-8 sm:space-y-10 px-4 sm:px-6 md:px-10 pt-8 sm:pt-10 md:pt-12 pb-8 sm:pb-10">
        {error && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 text-destructive-foreground rounded-md">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle className="font-semibold">Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!originalImageFile ? (
          <div
            className="p-8 sm:p-10 md:p-12 border-2 border-dashed border-muted-foreground/30 rounded-md hover:border-primary-action-border/70 transition-all duration-200 ease-in-out aspect-[16/7] sm:aspect-[16/6] md:aspect-[16/5] bg-card flex items-center justify-center"
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) { const eventStub = { target: { files: e.dataTransfer.files } } as unknown as React.ChangeEvent<HTMLInputElement>; handleImageUpload(eventStub); } }}
            onDragOver={(e) => e.preventDefault()}
          >
            <Label
              htmlFor="image-upload"
              className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-center group"
            >
              <UploadCloud className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-muted-foreground/50 group-hover:text-primary-action-border/80 transition-colors mb-3 sm:mb-4 md:mb-5" />
              <span className="text-base sm:text-lg md:text-xl font-medium text-foreground group-hover:text-primary-action-border/80 transition-colors">
                Drag & drop or click to upload
              </span>
              <Input id="image-upload" type="file" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} className="sr-only" />
              <p className="text-xs sm:text-sm text-muted-foreground/60 mt-2 sm:mt-3">Supports PNG, JPG, WEBP.</p>
            </Label>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 items-start">
              <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 border border-border/50 rounded-md bg-card/50">
                <h3 className="text-lg sm:text-xl font-semibold text-foreground text-center md:text-left">Original</h3>
                {originalImageDataUrl && originalImageDimensions && (
                  <div className="bg-black/20 p-2 rounded shadow-inner overflow-hidden">
                    <NextImage
                      src={originalImageDataUrl}
                      alt="Original Preview"
                      width={Math.min(originalImageDimensions.width, imagePreviewMaxWidth)}
                      height={(Math.min(originalImageDimensions.width, imagePreviewMaxWidth) / originalImageDimensions.width) * originalImageDimensions.height}
                      className="rounded border border-border/20 object-contain w-full h-auto max-h-[200px] sm:max-h-[240px] md:max-h-[280px] mx-auto"
                      data-ai-hint="uploaded image"
                      priority
                    />
                  </div>
                )}
                <p className="text-xs sm:text-sm text-muted-foreground">Name: <span className="font-medium text-card-foreground/80 truncate max-w-[150px] xs:max-w-[200px] sm:max-w-xs inline-block align-middle">{originalImageFile.name}</span></p>
                <p className="text-xs sm:text-sm text-muted-foreground">Dimensions: <span className="font-medium text-card-foreground/80">{originalImageDimensions?.width}x{originalImageDimensions?.height}</span></p>
                <p className="text-xs sm:text-sm text-muted-foreground">Size: <span className="font-medium text-card-foreground/80">{(originalImageSize! / 1024).toFixed(2)} KB</span></p>
              </div>

              <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 border border-border/50 rounded-md bg-card/50">
                <h3 className="text-lg sm:text-xl font-semibold text-foreground text-center md:text-left">Compressed</h3>
                {isProcessing && !compressedImagePreviewUrl ? (
                  <Skeleton className="h-[200px] sm:h-[240px] md:h-[280px] w-full rounded bg-muted/30" />
                ) : compressedImagePreviewUrl && originalImageDimensions ? (
                  <div className="bg-black/20 p-2 rounded shadow-inner overflow-hidden">
                    <NextImage
                      src={compressedImagePreviewUrl}
                      alt="Compressed Preview"
                      width={Math.min(originalImageDimensions.width, imagePreviewMaxWidth)}
                      height={(Math.min(originalImageDimensions.width, imagePreviewMaxWidth) / originalImageDimensions.width) * originalImageDimensions.height}
                      className="rounded border border-border/20 object-contain w-full h-auto max-h-[200px] sm:max-h-[240px] md:max-h-[280px] mx-auto"
                      data-ai-hint="compressed image"
                    />
                  </div>
                ) : (
                  <div className="h-[200px] sm:h-[240px] md:h-[280px] w-full rounded border border-border/30 flex items-center justify-center bg-muted/20 text-muted-foreground/70 text-sm sm:text-base">
                    Adjust settings to see preview
                  </div>
                )}
                {compressedImageSize !== null && (
                  <>
                    <p className="text-xs sm:text-sm text-muted-foreground">Size: <span className="font-medium text-card-foreground/80">{(compressedImageSize / 1024).toFixed(2)} KB</span></p>
                    <p className="text-xs sm:text-sm text-green-400/80 font-semibold">Savings: {calculateSavings()}%</p>
                  </>
                )}
              </div>
            </div>
            
            <Separator className="my-6 sm:my-8 bg-border/40" />

            <div className="space-y-5 sm:space-y-6">
              <div>
                <Label htmlFor="compression-slider" className="text-sm sm:text-md font-medium flex justify-between items-center text-foreground mb-1">
                  <span>Target File Size (% of Original)</span>
                  <span className="text-primary-action-border font-bold text-lg sm:text-xl">{targetFilePercentage}%</span>
                </Label>
                <Slider
                  id="compression-slider"
                  min={1}
                  max={100}
                  step={1}
                  value={[targetFilePercentage]}
                  onValueChange={(value) => setTargetFilePercentage(value[0])}
                  className="mt-2 sm:mt-3 [&>span:last-child>span]:bg-foreground [&>span:last-child>span]:border-foreground [&>span:first-child>span]:bg-primary-action-border"
                  disabled={isProcessing}
                  aria-label="Target file size percentage slider"
                />
                 <p className="text-xs text-muted-foreground/70 mt-2">Lower values aim for smaller files. 100% aims for best quality (lossless for PNGs).</p>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <Button onClick={handleGetAIRecommendation} disabled={isProcessing || !originalImageDataUrl} className={`${aiButtonClass} w-full md:w-auto flex items-center justify-center group`}>
                  {isProcessing && aiRecommendation === null && !error && originalImageDataUrl ? <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin text-[hsl(var(--accent-foreground))]" /> : <Sparkles className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-[hsl(var(--accent-foreground))] group-hover:text-background" />}
                  Suggest Optimal Target
                </Button>
                {aiRecommendation && (
                  <div className="p-3 sm:p-4 border border-accent/50 rounded-md bg-card/60 shadow-md">
                    <h4 className="text-sm sm:text-md font-semibold text-accent flex items-center mb-1 sm:mb-2"><Sparkles className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-accent" />AI Suggestion</h4>
                    <p className="text-xs sm:text-sm text-card-foreground/80">Recommended Target: <strong className="text-accent">{aiRecommendation.setting}%</strong></p>
                    <p className="text-xs text-muted-foreground/80 italic mt-1 leading-relaxed">{aiRecommendation.reasoning}</p>
                    <Button
                      size="sm"
                      onClick={() => setTargetFilePercentage(aiRecommendation.setting)}
                      className={`${buttonBaseClass} mt-2 sm:mt-3 py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm`}
                    >
                      Apply AI Target
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
      {originalImageFile && (
        <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4 pt-4 sm:pt-6 pb-8 sm:pb-10 px-4 sm:px-6 md:px-10 border-t border-border/50">
          <Button onClick={clearImageData} disabled={isProcessing} className={`${removeButtonClass} w-full sm:w-auto flex items-center justify-center group`}>
            <Trash2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-foreground" /> Remove Image
          </Button>
          <Button onClick={handleDownload} disabled={isProcessing || !compressedImagePreviewUrl} className={`${buttonBaseClass} w-full sm:w-auto flex items-center justify-center group`}>
            <Download className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-[hsl(var(--primary-action-text))] group-hover:text-[hsl(var(--primary-action-hover-text))]" /> Download Compressed
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
