"use client";

import React, { useEffect } from "react";
import type { FC } from "react";

const DemoPage: FC = () => {
  useEffect(() => {
    document.title = "Project Demo";
  }, []);

  return (
    <>
      <style>
        {`
          /* In a real app, this font should be linked in the main index.html */
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body {
              font-family: 'Inter', sans-serif;
              background-color: #000; /* Set a base black background */
          }
        `}
      </style>

      <div className="bg-black text-gray-300 antialiased min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-0 left-0 -translate-x-1/3 -translate-y-1/3 w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-purple-500/30 rounded-full blur-3xl animate-pulse opacity-40"></div>

        <main className="container z-10">
          {/* Hero Section */}
          <section className="text-center">
            <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight">
              Project Demo <span className="text-purple-400">⚡</span>
            </h1>
            <p className="mt-4 max-w-xl mx-auto text-lg text-gray-400">
              See our project in action. This video provides a quick overview of
              the key features.
            </p>
          </section>

          {/* Video Player Section */}
          <section className="mt-12">
            <div className="relative max-w-4xl mx-auto">
              <div className="bg-neutral-900/80 border border-neutral-800/80 backdrop-blur-sm rounded-2xl p-2 md:p-3 shadow-2xl shadow-black/30">
                {/* Replace this with your actual video file */}
                <video
                  src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                  poster="https://placehold.co/1280x720/000000/333333?text=Project+Demo"
                  controls
                  className="w-full h-full object-cover rounded-lg aspect-video"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          </section>

          {/* Description Section */}
          <section className="mt-12 max-w-3xl mx-auto">
            <div className="bg-neutral-900/50 border border-neutral-800/60 backdrop-blur-sm rounded-2xl p-8 text-center">
              <h3 className="text-2xl font-bold text-white">
                About The Project
              </h3>
              <p className="text-gray-400 leading-relaxed mt-3">
                {/* Replace this with a brief description of your project */}
                This is where you can write a short, compelling description of
                your project. Explain the problem you&apos;re solving, who
                it&apos;s for, and what makes your solution unique. Keep it
                concise and focused on the value you provide.
              </p>
            </div>
          </section>
        </main>
      </div>
    </>
  );
};

export default DemoPage;
