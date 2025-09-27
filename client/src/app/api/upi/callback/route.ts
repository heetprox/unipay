import { NextRequest, NextResponse } from 'next/server';
import { UniPayAPI } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward the callback to the backend API
    const response = await UniPayAPI.handleUpiCallback(body);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('UPI callback error:', error);
    return NextResponse.json(
      { error: 'Callback processing failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Handle GET callback (some UPI providers use GET)
  const searchParams = request.nextUrl.searchParams;
  const transactionId = searchParams.get('transactionId');
  const status = searchParams.get('status');
  
  if (!transactionId || !status) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  try {
    const response = await UniPayAPI.handleUpiCallback({
      transactionId,
      status: status as 'success' | 'failed'
    });
    
    // Redirect to success page
    const redirectUrl = new URL('/payment/success', request.url);
    redirectUrl.searchParams.set('txId', transactionId);
    
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('UPI callback error:', error);
    
    // Redirect to success page even on error so user can check status
    const redirectUrl = new URL('/payment/success', request.url);
    redirectUrl.searchParams.set('txId', transactionId);
    
    return NextResponse.redirect(redirectUrl);
  }
}