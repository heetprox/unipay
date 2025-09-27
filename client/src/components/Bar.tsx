"use client";

import Link from "next/link";
import { useState } from "react";
import { useMotionValueEvent, useScroll, motion, type Variants } from "framer-motion";
import TextHover from "./TextHover";
import { ConnectKitButton } from "connectkit";

const navVariants: Variants = {
    visible: {
        y: 0,
        opacity: 1,
        transition: {
            duration: 0.3,
            ease: "easeInOut"
        }
    },
    hidden: {
        y: -100,
        opacity: 0,
        transition: {
            duration: 0.3,
            ease: "easeInOut"
        }
    }
};

const navbarItems = [
    {
        id: 1,
        title: "Home",
        href: "/"
    },
    {
        id: 2,
        title: "About",
        href: "/about"
    },
    {
        id: 3,
        title: "Services",
        href: "/services"
    },
     {
        id: 4,
        title: "Demo",
        href: "/services"
    },
];

// Logo component defined in the same file
const Logo = () => {
    return (
        <div className="flex items-center">
            <span className="ml-2 font-semibold text-2xl">100xUPI</span>
        </div>
    );
};

export default function Bar() {
    const [hidden, setHidden] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const { scrollY } = useScroll();

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious();
        if (previous && latest > previous) {
            setHidden(true);
        } else {
            setHidden(false);
        }
    });

    return (
        <>
            <div className="absolute top-0 left-0 text-white sus overflow-hidden flex w-full h-fit justify-center"
            style={{
                paddingTop: "clamp(0.75em,  5vh, 200rem)",
                paddingLeft: 0,
                paddingRight: 0
            }}
            >
                <motion.nav
                    variants={navVariants}
                    className="bg-[#1a1a1a] rounded-lg z-50 w-[30%] flex items-center justify-between sm:hidden xm:hidden md:hidden lg:flex"
                    style={{
                        padding: "clamp(0.5em, 0.25vw, 200rem)"
                    }}
                    initial="visible"
                    animate={hidden ? "hidden" : "visible"}
                >
                    <div className="w-[25%] sus text-md">
                        <Link href={"/"}>
                           <Logo />
                        </Link>
                    </div>
                    <div className="flex gap-x-[20px] justify-center w-[50%]">
                        {navbarItems.map((item) => (
                            <Link
                                key={item.id}
                                className={`w-fit text-md sus capitalize flex flex-col hover`}
                                href={item.href}>
                                <TextHover
                                    titile1={item.title}
                                    titile2={item.title}
                                />
                            </Link>
                        ))}
                    </div>
                    <div className="w-[25%] flex justify-end items-center gap-2">
                        <ConnectKitButton.Custom>
                            {({ isConnected, isConnecting, show, hide, address, ensName, chain }) => {
                                return (
                                    <button
                                        onClick={show}
                                        className="flex bg-white text-black hover:text-white duration-300 rounded-md overflow-hidden cursor-pointer items-center space gap-2 px-2 py-1 relative"
                                        onMouseEnter={() => setIsHovered(true)}
                                        onMouseLeave={() => setIsHovered(false)}
                                    >
                                        <div className="sus text-md flex z-10 transition-all duration-500">
                                            {isConnected 
                                                ? ensName ?? `${address?.slice(0, 6)}...${address?.slice(-4)}`
                                                : "Connect Wallet"
                                            }
                                        </div>
                                        <div className={`w-2 h-2 absolute right-0 -top-5 bg-[#9478FC] rounded-full ${isHovered ? "scale-[30]" : "scale-100 -z-40"} transition-all duration-700 ease-in-out`}>
                                        </div>
                                    </button>
                                );
                            }}
                        </ConnectKitButton.Custom>
                    </div>
                </motion.nav>
            </div>
        </>
    );
}