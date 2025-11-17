/**
 * Simple X402 Server Example
 *
 * This example demonstrates a basic HTTP server with X402 payment protection
 * using the local facilitator for payment verification.
 */

import express from 'express';
import { createX402Middleware } from '../server/middleware.js';
import type { X402Request } from '../server/middleware.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Health check endpoint (free)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'X402 Protected API',
  });
});

// Create X402 middleware for protected routes
const x402 = createX402Middleware({
  network: (process.env.NETWORK as any) || 'polkax402', // Use env var for network
  recipientAddress: process.env.RECIPIENT_ADDRESS || '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  pricePerRequest: process.env.PRICE_PER_REQUEST || '10000000000', // .001 UNIT
  asset: process.env.CONTRACT_ADDRESS || '5CR7oWebzRjmYrACqiYhh4G7vX4yZnCxT4ZaucYU9mCNvXGM', // HTTPUSD contract address
  facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:4000/settle',
  requireFacilitatorConfirmation: true, // Server forwards to facilitator for on-chain execution
  maxPaymentAge: 300000, // 5 minutes
  resourceDescription: 'Premium API data access',
  responseMimeType: 'application/json',
});

// Protected route - requires payment
app.get('/api/premium/data', x402, (req, res) => {
  const x402Req = req as any as X402Request;
  const paymentInfo = x402Req.x402Payment;

  res.json({
    message: 'Success! You have accessed premium content.',
    data: {
      timestamp: new Date().toISOString(),
      randomValue: Math.random(),
      premiumData: [1, 2, 3, 4, 5],
    },
    payment: {
      from: paymentInfo?.payload.from,
      amount: paymentInfo?.payload.amount,
      confirmed: paymentInfo?.confirmedOnChain,
      blockHash: paymentInfo?.facilitatorResponse?.blockHash,
      extrinsicHash: paymentInfo?.facilitatorResponse?.extrinsicHash,
    },
  });
});

// Protected route with dynamic pricing
app.get('/api/premium/compute',
  createX402Middleware({
    network: (process.env.NETWORK as any) || 'dotx402', // Use env var for network
    recipientAddress: process.env.RECIPIENT_ADDRESS || '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    pricePerRequest: (req) => {
      // Price based on query parameter
      const complexity = parseInt(req.query.complexity as string) || 1;
      const basePrice = parseInt(process.env.PRICE_PER_REQUEST || '100000000000'); // Use env var, default 100 tokens
      return String(basePrice * complexity);
    },
    asset: process.env.CONTRACT_ADDRESS || '5CR7oWebzRjmYrACqiYhh4G7vX4yZnCxT4ZaucYU9mCNvXGM', // HTTPUSD contract address
    facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:4000/execute',
    requireFacilitatorConfirmation: true, // Server forwards to facilitator
    resourceDescription: 'Computational service with dynamic pricing based on complexity parameter',
    responseMimeType: 'application/json',
  }),
  (req, res) => {
    const x402Req = req as any as X402Request;
    const complexity = parseInt(req.query.complexity as string) || 1;

    // Simulate computation
    const result = Array.from({ length: complexity }, (_, i) => i * i);

    res.json({
      message: 'Computation complete!',
      complexity,
      result,
      payment: {
        from: x402Req.x402Payment?.payload.from,
        amount: x402Req.x402Payment?.payload.amount,
        confirmed: x402Req.x402Payment?.confirmedOnChain,
      },
    });
  }
);

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 X402 Protected Server - LIVE\n');
  console.log(`📡 Listening on:     ${PORT}`);
  console.log(`🌐 Network:    ${(process.env.NETWORK as any) || 'dotx402'}`)
  console.log(`👤 Recipient:     ${process.env.RECIPIENT_ADDRESS || '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'}`);
  console.log(`Contract Adddress: ${process.env.CONTRACT_ADDRESS || '5CgiSNmors7m5Hc8Yu1ZXwSzqNKTZGN9T6mc9bkJUvQpJX3t'}`)
  console.log(`💰 Price/request: ${process.env.PRICE_PER_REQUEST || '1000000000000'} (smallest unit)`);
  console.log(`🔄 Facilitator:   ${process.env.FACILITATOR_URL || 'http://localhost:4000/execute'}\n`);
  console.log('💡 Endpoints:');
  console.log('   GET  /health                - Health check (free)');
  console.log('   GET  /api/premium/data      - Premium data (requires payment)');
  console.log('   GET  /api/premium/compute   - Computation (dynamic pricing)\n');
});
