
import { ShrinkWrapApp } from '@/components/shrink-wrap-app';
import { Toaster } from '@/components/ui/toaster';
import NextImage from 'next/image';

export default function HomePage() {
  return (
    <>
      <div className="fixed inset-0 z-[-1]">
        {/* <NextImage
          src="https://placehold.co/1920x1080/0A0A0A/111111.png?text=."
          alt="Dark abstract monochrome background"
          fill
          style={{objectFit: "cover"}}
          quality={75}
          priority
          data-ai-hint="dark abstract texture"
        /> */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-3xl"></div>
      </div>
      <main className="container mx-auto px-4 min-h-screen flex flex-col items-center relative z-10 pt-16 sm:pt-20 md:pt-28 text-center">
        <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-2 font-medium">IMAGE OPTIMIZER</p>
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-foreground mb-4 sm:mb-5">
          ShrinkWrap
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-muted-foreground/70 mb-8 sm:mb-10 md:mb-12 tracking-normal max-w-md sm:max-w-lg">
          Intelligently compress your images. Drag & drop or upload, adjust target size, and download.
        </p>

        <div className="w-full max-w-4xl">
          <ShrinkWrapApp />
        </div>
        <Toaster />
      </main>
    </>
  );
}
