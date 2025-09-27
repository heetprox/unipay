"use client";

import React from "react";

export default function Background() {
  return (
    <>
      <div className="fixed top-0 left-0 -z-50 w-full h-full bg-black">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
          <div className="aurora-container">
            <div className="aurora-orb"></div>
            <div className="aurora-orb"></div>
            <div className="aurora-orb"></div>
            <div className="aurora-orb"></div>
            <div className="aurora-orb"></div>
          </div>
        </div>
      </div>
    </>
  );
}
