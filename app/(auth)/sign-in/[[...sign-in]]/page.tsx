"use client";

import { SignIn } from "@clerk/nextjs";
import { motion } from "motion/react";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex">
      {/* Brand Panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950">
        {/* Animated blobs */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-blue-600/20 blur-3xl"
          animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.1, 0.95, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-500/15 blur-3xl"
          animate={{ x: [0, -30, 25, 0], y: [0, 40, -20, 0], scale: [1, 0.9, 1.1, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-56 h-56 rounded-full bg-blue-400/10 blur-3xl"
          animate={{ x: [0, 20, -40, 0], y: [0, -50, 10, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Brand content */}
        <motion.div
          className="relative z-10 flex flex-col justify-center px-16"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">KC</span>
            </div>
            <span className="text-white text-2xl font-bold tracking-tight">Kodex</span>
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Be audit-ready<br />in 14 days.
          </h1>
          <p className="text-blue-200/70 text-lg max-w-md">
            Stay compliant automatically. GDPR, EU AI Act, ISO 27001 and more — all in one platform.
          </p>

          {/* Trust indicators */}
          <div className="mt-12 flex items-center gap-6 text-blue-300/50 text-sm">
            <span>GDPR</span>
            <span className="w-1 h-1 rounded-full bg-blue-300/30" />
            <span>EU AI Act</span>
            <span className="w-1 h-1 rounded-full bg-blue-300/30" />
            <span>ISO 27001</span>
          </div>
        </motion.div>
      </div>

      {/* Sign-in panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">KC</span>
            </div>
            <span className="text-foreground text-xl font-bold tracking-tight">Kodex</span>
          </div>

          <SignIn
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "shadow-none bg-transparent",
              },
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}
