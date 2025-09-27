"use client";

import Link from "next/link";
import { useState } from "react";
import {
  useMotionValueEvent,
  useScroll,
  motion,
  type Variants,
  AnimatePresence,
} from "framer-motion";
import { ConnectKitButton } from "connectkit";
import { Menu, X } from "lucide-react";

// Navigation variants
const navVariants: Variants = {
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
  hidden: {
    y: -100,
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
};

// Mobile menu variants
const mobileMenuVariants: Variants = {
  open: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
  closed: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
};

// Navbar items
const navbarItems = [
  {
    id: 4,
    title: "Demo",
    href: "/services",
  },
];

// Logo component
const Logo = () => {
  return (
    <div className="flex items-center">
      <span className="ml-2 m-font text-2xl md:text-3xl text-white">
        UniPay
      </span>
    </div>
  );
};

// TextHover component (simplified version)
const TextHover = ({ title1, title2 }: { title1: string; title2: string }) => {
  return (
    <span className="hover:text-[#9478FC] transition-colors duration-300">
      {title1}
    </span>
  );
};

export default function Navbar() {
  const [hidden, setHidden] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious();
    if (previous && latest > previous && latest > 50) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  });

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <>
      {/* Desktop and Mobile Navbar */}
      <div className="fixed top-0 left-0 right-0 z-50 w-full">
        <div className="px-4 py-3 md:px-6 lg:px-8">
          <motion.nav
            variants={navVariants}
            className="backdrop-blur-md rounded-lg bg-neutral-400/10 shadow-lg"
            initial="visible"
            animate={hidden ? "hidden" : "visible"}
          >
            {/* Desktop Layout */}
            <div className="hidden lg:flex items-center justify-between px-6 py-3">
              {/* Logo */}
              <div className="flex-shrink-0">
                <Link href="/">
                  <Logo />
                </Link>
              </div>

              {/* Navigation Links */}
              <div className="flex items-center gap-8">
                {navbarItems.map((item) => (
                  <Link
                    key={item.id}
                    className="text-white text-md capitalize hover:text-[#9478FC] transition-colors duration-300"
                    href={item.href}
                  >
                    <TextHover title1={item.title} title2={item.title} />
                  </Link>
                ))}
              </div>

              {/* Connect Wallet Button */}
              <div className="flex-shrink-0">
                <ConnectKitButton.Custom>
                  {({ isConnected, show, address, ensName }) => {
                    return (
                      <button
                        onClick={show}
                        className="flex bg-white text-black hover:text-white duration-300 rounded-md overflow-hidden cursor-pointer items-center gap-2 px-4 py-2 relative group"
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                      >
                        <div className="text-sm font-medium flex z-10 transition-all duration-500">
                          {isConnected
                            ? ensName ??
                              `${address?.slice(0, 6)}...${address?.slice(-4)}`
                            : "Connect Wallet"}
                        </div>
                        <div
                          className={`w-2 h-2 absolute right-0 -top-5 bg-[#9478FC] rounded-full ${
                            isHovered ? "scale-[30]" : "scale-100 -z-40"
                          } transition-all duration-700 ease-in-out`}
                        />
                      </button>
                    );
                  }}
                </ConnectKitButton.Custom>
              </div>
            </div>

            {/* Mobile/Tablet Layout */}
            <div className="lg:hidden flex items-center justify-between px-4 py-3">
              {/* Logo */}
              <div className="flex-shrink-0">
                <Link href="/">
                  <Logo />
                </Link>
              </div>

              {/* Mobile Menu Button and Connect Button */}
              <div className="flex items-center gap-3">
                {/* Connect Wallet Button - Mobile */}
                <ConnectKitButton.Custom>
                  {({ isConnected, show, address, ensName }) => {
                    return (
                      <button
                        onClick={show}
                        className="bg-white text-black hover:bg-[#9478FC] hover:text-white duration-300 rounded-md px-3 py-2 text-sm font-medium"
                      >
                        {isConnected
                          ? ensName ??
                            `${address?.slice(0, 4)}...${address?.slice(-3)}`
                          : "Connect"}
                      </button>
                    );
                  }}
                </ConnectKitButton.Custom>

                {/* Mobile Menu Toggle */}
                <button
                  onClick={toggleMobileMenu}
                  className="text-white hover:text-[#9478FC] p-2 transition-colors duration-300"
                  aria-label="Toggle mobile menu"
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
              {isMobileMenuOpen && (
                <motion.div
                  variants={mobileMenuVariants}
                  initial="closed"
                  animate="open"
                  exit="closed"
                  className="lg:hidden border-t border-gray-800/50 px-4 py-3"
                >
                  <div className="flex flex-col space-y-3">
                    {navbarItems.map((item) => (
                      <Link
                        key={item.id}
                        className="text-white text-md capitalize hover:text-[#9478FC] transition-colors duration-300 py-2"
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <TextHover title1={item.title} title2={item.title} />
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.nav>
        </div>
      </div>

      {/* Spacer to prevent content from hiding behind fixed navbar */}
      <div className="h-20 md:h-24"></div>
    </>
  );
}
