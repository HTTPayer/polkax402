/**
 * Contract interaction helper utilities
 */

import type { ContractPromise } from '@polkadot/api-contract';
import type { ApiPromise } from '@polkadot/api';
import type { WeightV2 } from '@polkadot/types/interfaces';

/**
 * Get the number of decimals from a PSP22 token contract
 * @param contract - The contract instance
 * @param callerAddress - Address to use for the query (can be any address)
 * @param api - The API instance
 * @returns The number of decimals, defaults to 12 if query fails
 */
export async function getDecimals(
  contract: ContractPromise,
  callerAddress: string,
  api: ApiPromise
): Promise<number> {
  try {
    const { result, output } = await contract.query.decimals(
      callerAddress,
      {
        gasLimit: api.registry.createType('WeightV2', {
          refTime: 100_000_000_000n,
          proofSize: 100_000n,
        }) as WeightV2,
      }
    );

    console.log('DEBUG decimals query result:', {
      isOk: result.isOk,
      isErr: result.isErr,
      output: output?.toString(),
      outputType: typeof output,
      outputToHuman: (output as any)?.toHuman?.()
    });

    if (result.isOk && output) {
      const value = (output as any).toHuman?.() || (output as any).toNumber?.() || 0;
      console.log('DEBUG decimals parsed value:', value);
      return typeof value === 'number' ? value : parseInt(value) || 12;
    }
  } catch (error) {
    console.warn('Failed to query decimals from contract:', error);
  }

  // Default to 12 decimals if query fails
  return 12;
}

/**
 * Format a token amount to human-readable format
 * @param amount - The raw token amount (smallest unit)
 * @param decimals - Number of decimals
 * @returns Human-readable amount as string
 */
export function formatTokenAmount(amount: string | number | bigint, decimals: number): string {
  const amountBigInt = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = amountBigInt / divisor;
  const remainder = amountBigInt % divisor;

  if (remainder === 0n) {
    return whole.toString();
  }

  const fractional = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fractional}`;
}

/**
 * Parse a human-readable token amount to smallest unit
 * @param amount - Human-readable amount (e.g., "100.5")
 * @param decimals - Number of decimals
 * @returns Amount in smallest unit as string
 */
export function parseTokenAmount(amount: string | number, decimals: number): string {
  const amountStr = amount.toString();
  const [whole, fractional = ''] = amountStr.split('.');

  const paddedFractional = fractional.padEnd(decimals, '0').slice(0, decimals);
  const rawAmount = whole + paddedFractional;

  return BigInt(rawAmount).toString();
}

/**
 * Get the balance of an account from a PSP22 token contract
 * @param contract - The contract instance
 * @param owner - Address to check balance for
 * @param callerAddress - Address to use for the query
 * @param api - The API instance
 * @returns Balance in smallest unit, or null if query fails
 */
export async function getBalance(
  contract: ContractPromise,
  owner: string,
  callerAddress: string,
  api: ApiPromise
): Promise<string | null> {
  try {
    const { result, output } = await contract.query.balanceOf(
      callerAddress,
      {
        gasLimit: api.registry.createType('WeightV2', {
          refTime: 100_000_000_000n,
          proofSize: 100_000n,
        }) as WeightV2,
      },
      owner
    );

    if (result.isOk && output) {
      return output.toString();
    }
  } catch (error) {
    console.warn('Failed to query balance from contract:', error);
  }

  return null;
}

/**
 * Get total supply from a PSP22 token contract
 * @param contract - The contract instance
 * @param callerAddress - Address to use for the query
 * @param api - The API instance
 * @returns Total supply in smallest unit, or null if query fails
 */
export async function getTotalSupply(
  contract: ContractPromise,
  callerAddress: string,
  api: ApiPromise
): Promise<string | null> {
  try {
    const { result, output } = await contract.query.totalSupply(
      callerAddress,
      {
        gasLimit: api.registry.createType('WeightV2', {
          refTime: 100_000_000_000n,
          proofSize: 100_000n,
        }) as WeightV2,
      }
    );

    if (result.isOk && output) {
      return output.toString();
    }
  } catch (error) {
    console.warn('Failed to query total supply from contract:', error);
  }

  return null;
}
