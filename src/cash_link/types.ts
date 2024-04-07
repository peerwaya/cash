import { Commitment } from '@solana/web3.js';
import { CashLinkDistributionType } from 'src/accounts';
export interface InitializeCashLinkInput {
  wallet: string;
  mint?: string;
  passKey: string;
  amount: string;
  minAmount?: string;
  feeBps?: number;
  fixedFee?: string;
  feeToRedeem?: string;
  distributionType: CashLinkDistributionType;
  maxNumRedemptions: number;
  commitment?: Commitment;
  computeUnitPrice?: number;
  computeBudget?: number;
  fingerprintEnabled?: boolean;
  numDaysToExpire?: number;
}

export interface ResultContext {
  transaction: string;
  slot: number;
}

export interface CashLinkInput {
  walletAddress: string;
  passKey: string;
  commitment?: Commitment;
  computeUnitPrice?: number;
  computeBudget?: number;
}

export interface RedeemCashLinkInput extends CashLinkInput {
  fingerprint?: string;
}
export interface SettleAndTransferInput {
  walletAddress: string;
  transferTokenMintAddress: string;
  amountToSettle: string;
  amountToTransfer: string;
  cashLinkAddress: string;
  memo?: string;
  fee?: string;
}

export interface CancelPaymentOutput {
  signature: string;
}
