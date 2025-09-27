'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { UniPayAPI } from '@/lib/api';
import Link from 'next/link';
import { QrCode, Smartphone, ArrowLeft, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import QRCodeLib from 'qrcode';

export default function QRPaymentPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [transactionId, setTransactionId] = useState<string>('');
    const [qrCodeData, setQrCodeData] = useState<string>('');
    const [qrCodeImage, setQrCodeImage] = useState<string>('');
    const [intentUrl, setIntentUrl] = useState<string>('');
    const [amount, setAmount] = useState<string>('');
    const [quoteType, setQuoteType] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [paymentStatus, setPaymentStatus] = useState<'pending' | 'checking' | 'success' | 'failed'>('pending');
    const [statusCheckInterval, setStatusCheckInterval] = useState<NodeJS.Timeout | null>(null);
    const [monitoringTime, setMonitoringTime] = useState(0);
    const [showManualOptions, setShowManualOptions] = useState(false);

    useEffect(() => {
        // Get transaction details from URL params or localStorage
        const txId = searchParams.get('txId') || localStorage.getItem('upiTransactionId');
        const qr = searchParams.get('qr') || localStorage.getItem('qrCode');
        const intent = searchParams.get('intent') || localStorage.getItem('intentUrl');
        const amt = localStorage.getItem('inrAmount') || '';
        const type = localStorage.getItem('quoteType') || '';

        if (txId && qr && intent) {
            setTransactionId(txId);

            // Decode QR code if it's base64 encoded
            const decodedQr = qr.startsWith('data:text/plain;base64,')
                ? atob(qr.replace('data:text/plain;base64,', ''))
                : qr;

            setQrCodeData(decodedQr);
            setIntentUrl(decodeURIComponent(intent));
            setAmount(amt);
            setQuoteType(type);

            // Generate QR code image
            generateQRCode(decodedQr);

            // Start checking payment status
            startStatusCheck(txId);
        } else {
            setError('Payment details not found. Please initiate payment again.');
            setLoading(false);
        }

        return () => {
            if (statusCheckInterval) {
                clearInterval(statusCheckInterval);
            }
        };
    }, [searchParams]);

    const generateQRCode = async (data: string) => {
        try {
            const qrCodeDataURL = await QRCodeLib.toDataURL(data, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            setQrCodeImage(qrCodeDataURL);
            setLoading(false);
        } catch (err) {
            console.error('Failed to generate QR code:', err);
            setError('Failed to generate QR code');
            setLoading(false);
        }
    };

    const startStatusCheck = (txId: string) => {
        // Initial check immediately
        checkPaymentStatus(txId);

        // Start monitoring time counter
        const timeInterval = setInterval(() => {
            setMonitoringTime(prev => {
                const newTime = prev + 1;
                // Show manual options after 2 minutes of monitoring
                if (newTime === 120) {
                    setShowManualOptions(true);
                    showToast('Taking longer than expected? You can check manually or contact support.', 'info');
                }
                return newTime;
            });
        }, 1000);

        // Then check every 2 seconds for faster response
        const statusInterval = setInterval(() => {
            checkPaymentStatus(txId);
        }, 2000);

        setStatusCheckInterval(statusInterval);

        // Clean up time counter when status checking stops
        return () => {
            clearInterval(timeInterval);
            clearInterval(statusInterval);
        };
    };

    const checkPaymentStatus = async (txId: string) => {
        try {
            setPaymentStatus('checking');
            const status = await UniPayAPI.getTransactionStatus(txId);

            console.log('Payment status check:', status.payment.status);

            // Check for SUCCESS status (from backend) or completed (alternative)
            if (status.payment.status === 'SUCCESS' || status.payment.status === 'completed') {
                setPaymentStatus('success');
                if (statusCheckInterval) {
                    clearInterval(statusCheckInterval);
                }

                showToast('Payment successful! Tokens minted automatically! Redirecting...', 'success');

                // Redirect to success page after showing success message
                setTimeout(() => {
                    router.push(`/payment/success?txId=${txId}`);
                }, 1500);
            } else if (status.payment.status === 'FAILED' || status.payment.status === 'failed') {
                setPaymentStatus('failed');
                if (statusCheckInterval) {
                    clearInterval(statusCheckInterval);
                }
                showToast('Payment failed. Please try again.', 'error');
            } else {
                setPaymentStatus('pending');
            }
        } catch (err) {
            console.error('Status check failed:', err);
            // Don't change status on API errors, keep checking
            setTimeout(() => setPaymentStatus('pending'), 1000);
        }
    };

    const openUpiApp = () => {
        if (intentUrl) {
            window.location.href = intentUrl;
        }
    };

    const copyUpiLink = async () => {
        if (qrCodeData) {
            try {
                await navigator.clipboard.writeText(qrCodeData);
                showToast('UPI link copied to clipboard!', 'success');
            } catch (err) {
                console.error('Failed to copy UPI link:', err);
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = qrCodeData;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('UPI link copied to clipboard!', 'success');
            }
        }
    };

    const downloadQRCode = () => {
        if (qrCodeImage) {
            const link = document.createElement('a');
            link.download = `upi-qr-${transactionId}.png`;
            link.href = qrCodeImage;
            link.click();
            showToast('QR code downloaded!', 'success');
        }
    };

    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
        const toastDiv = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-900/90 border-green-700' :
            type === 'error' ? 'bg-red-900/90 border-red-700' :
                'bg-blue-900/90 border-blue-700';
        toastDiv.className = `fixed top-4 right-4 ${bgColor} border text-white p-3 rounded-lg z-50 backdrop-blur-md`;
        toastDiv.textContent = message;
        document.body.appendChild(toastDiv);
        setTimeout(() => {
            if (document.body.contains(toastDiv)) {
                document.body.removeChild(toastDiv);
            }
        }, 3000);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="flex items-center gap-3">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span>Loading payment details...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black text-white">
                <div className="max-w-md w-full bg-white/10 backdrop-blur-md p-6 rounded-lg shadow-lg text-center">
                    <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-4">Payment Error</h1>
                    <p className="mb-6 text-gray-300">{error}</p>
                    <Link
                        href="/"
                        className="block w-full bg-[#9478FC] text-white py-2 px-4 rounded-md hover:bg-[#7d63d4] transition-all duration-300"
                    >
                        Start New Payment
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white p-4">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <Link href="/" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold">Complete Payment</h1>
                        <p className="text-sm text-gray-400">Scan QR or use UPI app</p>
                    </div>
                </div>

                {/* Payment Status */}
                <div className="mb-6 p-4 bg-white/5 rounded-lg border border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-300">Payment Status</span>
                        {paymentStatus === 'checking' && <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />}
                        {paymentStatus === 'success' && <CheckCircle className="w-4 h-4 text-green-400" />}
                        {paymentStatus === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                        {paymentStatus === 'pending' && <div className="w-4 h-4 bg-yellow-400 rounded-full animate-pulse" />}
                    </div>
                    <div className={`text-sm font-medium mb-2 ${paymentStatus === 'pending' ? 'text-yellow-400' :
                        paymentStatus === 'checking' ? 'text-blue-400' :
                            paymentStatus === 'success' ? 'text-green-400' :
                                'text-red-400'
                        }`}>
                        {paymentStatus === 'pending' && 'Monitoring payment automatically...'}
                        {paymentStatus === 'checking' && 'Checking payment status...'}
                        {paymentStatus === 'success' && 'Payment successful! Redirecting...'}
                        {paymentStatus === 'failed' && 'Payment failed'}
                    </div>

                    {paymentStatus === 'pending' && (
                        <div className="text-xs text-gray-400">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                                    <span>Auto-checking every 2 seconds</span>
                                </div>
                                <span className="text-gray-500">
                                    {Math.floor(monitoringTime / 60)}:{(monitoringTime % 60).toString().padStart(2, '0')}
                                </span>
                            </div>
                            <p className="mt-1">Complete your payment in the UPI app and we'll detect it automatically</p>
                        </div>
                    )}

                    {paymentStatus === 'success' && (
                        <div className="text-xs text-green-300">
                            <p>🎉 Payment confirmed! Taking you to the next step...</p>
                        </div>
                    )}

                    {paymentStatus === 'failed' && (
                        <div className="text-xs text-red-300">
                            <p>❌ Payment was not successful. You can try again or contact support.</p>
                        </div>
                    )}
                </div>

                {/* Payment Details */}
                <div className="mb-6 p-4 bg-white/5 rounded-lg border border-gray-800">
                    <h2 className="text-lg font-semibold mb-3">Payment Details</h2>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Amount:</span>
                            <span className="font-medium">₹{amount}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Buying:</span>
                            <span className="font-medium">{quoteType === 'ETH/INR' ? 'ETH' : 'USDC'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Transaction ID:</span>
                            <span className="font-mono text-xs">{transactionId}</span>
                        </div>
                    </div>
                </div>

                {/* QR Code */}
                <div className="mb-6 p-6 bg-white rounded-lg">
                    <div className="text-center mb-4">
                        <QrCode className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                        <h3 className="text-lg font-semibold text-gray-800">Scan to Pay</h3>
                        <p className="text-sm text-gray-600">Use any UPI app to scan this QR code</p>
                    </div>

                    {qrCodeImage ? (
                        <div className="flex justify-center">
                            <img
                                src={qrCodeImage}
                                alt="UPI QR Code"
                                className="w-64 h-64 border border-gray-300 rounded-lg"
                            />
                        </div>
                    ) : (
                        <div className="w-64 h-64 border border-gray-300 rounded-lg flex items-center justify-center bg-gray-100 mx-auto">
                            <div className="text-center text-gray-600">
                                <QrCode className="w-12 h-12 mx-auto mb-2 animate-pulse" />
                                <p className="text-sm">Generating QR Code...</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <button
                        onClick={openUpiApp}
                        className="w-full bg-[#9478FC] text-white py-3 px-4 rounded-lg hover:bg-[#7d63d4] transition-all duration-300 flex items-center justify-center gap-2 font-medium"
                    >
                        <Smartphone className="w-5 h-5" />
                        Open UPI App
                    </button>

                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={copyUpiLink}
                            className="bg-white/10 text-white py-2 px-3 rounded-lg hover:bg-white/15 transition-all duration-300 text-xs"
                        >
                            Copy Link
                        </button>

                        <button
                            onClick={downloadQRCode}
                            disabled={!qrCodeImage}
                            className="bg-white/10 text-white py-2 px-3 rounded-lg hover:bg-white/15 transition-all duration-300 text-xs disabled:opacity-50"
                        >
                            Download QR
                        </button>

                        <button
                            onClick={() => checkPaymentStatus(transactionId)}
                            disabled={paymentStatus === 'checking'}
                            className="bg-white/10 text-white py-2 px-3 rounded-lg hover:bg-white/15 transition-all duration-300 text-xs disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            <RefreshCw className={`w-3 h-3 ${paymentStatus === 'checking' ? 'animate-spin' : ''}`} />
                            Check Now
                        </button>
                    </div>
                </div>

                {/* Instructions */}
                <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                    <h4 className="font-medium text-blue-300 mb-2">How it works:</h4>
                    <ol className="text-sm text-blue-200 space-y-1 list-decimal list-inside">
                        <li>Scan the QR code with any UPI app (GPay, PhonePe, Paytm, etc.)</li>
                        <li>Or click "Open UPI App" to pay directly</li>
                        <li>Complete the payment in your UPI app</li>
                        <li><strong>Sit back and relax!</strong> We're monitoring your payment automatically</li>
                        <li>Once confirmed, your tokens will be automatically minted to your wallet!</li>
                    </ol>

                    <div className="mt-3 p-2 bg-blue-800/30 rounded text-xs text-blue-100">
                        💡 <strong>No need to refresh!</strong> This page automatically checks your payment status every 2 seconds.
                    </div>
                </div>

                {/* Manual Options - Show after 2 minutes */}
                {showManualOptions && (
                    <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                        <h4 className="font-medium text-yellow-300 mb-2">Payment taking longer than expected?</h4>
                        <p className="text-sm text-yellow-200 mb-3">
                            If you've completed the payment but it's not being detected automatically, you can:
                        </p>
                        <div className="space-y-2">
                            <Link
                                href={`/payment/success?txId=${transactionId}`}
                                className="block w-full text-center bg-yellow-700 text-white py-2 px-4 rounded-md hover:bg-yellow-600 transition-all duration-300 text-sm"
                            >
                                Check Payment Status Manually
                            </Link>
                            <button
                                onClick={() => checkPaymentStatus(transactionId)}
                                className="w-full bg-white/10 text-white py-2 px-4 rounded-md hover:bg-white/15 transition-all duration-300 text-sm"
                            >
                                Force Check Now
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer */}
                {!showManualOptions && (
                    <div className="mt-6 text-center">
                        <Link
                            href={`/payment/success?txId=${transactionId}`}
                            className="text-[#9478FC] hover:underline text-sm"
                        >
                            Check Payment Status Manually
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}