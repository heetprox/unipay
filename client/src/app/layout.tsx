import type { Metadata } from "next";
import "./globals.css";
import "./fonts.css"
import { Web3Provider } from "@/context/Web3Provider";
import Bar from "@/components/Bar";

export const metadata: Metadata = {
  title: "UniPay",
  description: "Get your token from UPI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`s-font antialiased`}
      >
        <Web3Provider>
          <Bar />
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
