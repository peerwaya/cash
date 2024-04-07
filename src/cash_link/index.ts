import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SystemProgram,
  Connection,
  Keypair,
  Commitment,
  RpcResponseAndContext,
  SignatureResult,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import BN from 'bn.js';
import {
  InitializeCashLinkInput,
  ResultContext,
  CashLinkInput,
  RedeemCashLinkInput,
} from './types';
import { CashProgram } from '../cash_program';
import { CashLink, CashLinkState } from '../accounts/cash_link';
import {
  CancelCashLinkArgs,
  CancelCashLinkParams,
  InitCashLinkArgs,
  InitCashLinkParams,
  CloseCashLinkArgs,
  CloseCashLinkParams,
  RedeemCashLinkArgs,
  RedeemCashLinkParams,
} from '../transactions';
import { Account } from '@metaplex-foundation/mpl-core';
import { Redemption } from '../accounts/redemption';

export const FAILED_TO_FIND_ACCOUNT = 'Failed to find account';
export const INVALID_ACCOUNT_OWNER = 'Invalid account owner';
export const INVALID_AUTHORITY = 'Invalid authority';
export const INVALID_PAYER_ADDRESS = 'Invalid payer address';
export const ACCOUNT_ALREADY_EXPIRED = 'Account already canceled';
export const ACCOUNT_ALREADY_SETTLED = 'Account already settled';
export const ACCOUNT_NOT_INITIALIZED_OR_SETTLED = 'Account not initialized or settled';
export const ACCOUNT_NOT_EXPIRED = 'Account not canceled';
export const ACCOUNT_HAS_REDEMPTIONS = 'Account has redemptions';
export const INVALID_SIGNATURE = 'Invalid signature';
export const AMOUNT_MISMATCH = 'Amount mismatch';
export const INVALID_STATE = 'Invalid state';
export const FEE_MISMATCH = 'Fee mismatch';
export const TRANSACTION_SEND_ERROR = 'Transaction send error';
export const FINGERPRINT_NOT_FOUND = 'Fingerprint required';

export class CashLinkClient {
  private feePayer: Keypair;
  private authority: Keypair;
  private feeWallet: PublicKey;
  private connection: Connection;

  constructor(feePayer: Keypair, authority: Keypair, feeWallet: PublicKey, connection: Connection) {
    this.feePayer = feePayer;
    this.authority = authority;
    this.feeWallet = feeWallet;
    this.connection = connection;
  }

  cancel = async (input: CashLinkInput): Promise<ResultContext> => {
    const [cashLinkAddress, bump] = await CashProgram.findCashLinkAccount(
      new PublicKey(input.passKey),
    );
    const cashLink = await _getCashLinkAccount(this.connection, cashLinkAddress);
    if (cashLink == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const transaction = await this.cancelTransaction(cashLink, bump, input);
    if (input.computeBudget) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    transaction.recentBlockhash = value.blockhash;
    transaction.lastValidBlockHeight = value.lastValidBlockHeight;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    return {
      transaction: transaction.serialize().toString('base64'),
      slot: context.slot,
    };
  };

  cancelAndClose = async (input: CashLinkInput): Promise<ResultContext> => {
    const [cashLinkAddress, bump] = await CashProgram.findCashLinkAccount(
      new PublicKey(input.passKey),
    );
    const cashLink = await _getCashLinkAccount(this.connection, cashLinkAddress);
    if (cashLink == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const transaction = await this.cancelTransaction(cashLink, bump, input);
    if (cashLink.data.totalRedemptions === 0) {
      const closeInstruction = this.closeInstruction({
        cashLink: cashLinkAddress,
        authority: this.authority.publicKey,
        feePayer: this.feePayer.publicKey,
      });
      transaction.add(closeInstruction);
    }
    if (input.computeBudget) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    transaction.recentBlockhash = value.blockhash;
    transaction.lastValidBlockHeight = value.lastValidBlockHeight;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    return {
      transaction: transaction.serialize().toString('base64'),
      slot: context.slot,
    };
  };

  cancelTransaction = async (
    cashLink: CashLink,
    cashLinkBump: number,
    input: CashLinkInput,
  ): Promise<Transaction> => {
    if (cashLink.data?.state === CashLinkState.Expired) {
      throw new Error(ACCOUNT_ALREADY_EXPIRED);
    }
    if (cashLink.data?.state === CashLinkState.Redeemed) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const owner = new PublicKey(cashLink.data.owner);
    const cancelInstruction = await this.cancelInstruction({
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      ownerToken: cashLink.data.mint
        ? (
            await spl.getOrCreateAssociatedTokenAccount(
              this.connection,
              this.feePayer,
              new PublicKey(cashLink.data.mint),
              owner,
              true,
            )
          ).address
        : owner,
      vaultToken: cashLink.data.mint
        ? await _findAssociatedTokenAddress(cashLink.pubkey, new PublicKey(cashLink.data.mint))
        : null,
      feePayer: this.feePayer.publicKey,
      passKey: new PublicKey(input.passKey),
      cashLinkBump,
    });
    return new Transaction().add(cancelInstruction);
  };

  cancelInstruction = async (params: CancelCashLinkParams): Promise<TransactionInstruction> => {
    const keys = [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.cashLink, isSigner: false, isWritable: true },
      { pubkey: params.passKey, isSigner: false, isWritable: false },
      { pubkey: params.ownerToken, isSigner: false, isWritable: true },
      { pubkey: params.feePayer, isSigner: false, isWritable: true },
      {
        pubkey: SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
    if (params.vaultToken) {
      keys.push({
        pubkey: params.vaultToken,
        isSigner: false,
        isWritable: true,
      });
    }
    keys.push(
      {
        pubkey: spl.TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    );
    return new TransactionInstruction({
      keys,
      programId: CashProgram.PUBKEY,
      data: CancelCashLinkArgs.serialize({
        cashLinkBump: params.cashLinkBump,
      }),
    });
  };

  close = async (input: CashLinkInput): Promise<ResultContext> => {
    const [cashLinkAddress] = await CashProgram.findCashLinkAccount(new PublicKey(input.passKey));
    const cashLink = await _getCashLinkAccount(this.connection, cashLinkAddress);
    if (cashLink == null || !cashLink.data) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    if (cashLink.data.state !== CashLinkState.Expired) {
      throw new Error(ACCOUNT_NOT_EXPIRED);
    }
    if (cashLink.data.totalRedemptions !== 0) {
      throw new Error(ACCOUNT_HAS_REDEMPTIONS);
    }
    const closeInstruction = this.closeInstruction({
      cashLink: cashLinkAddress,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    });
    const transaction = new Transaction().add(closeInstruction);
    if (input.computeBudget) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    transaction.recentBlockhash = value.blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    return {
      transaction: transaction.serialize().toString('base64'),
      slot: context.slot,
    };
  };

  closeInstruction = (params: CloseCashLinkParams): TransactionInstruction => {
    return new TransactionInstruction({
      programId: CashProgram.PUBKEY,
      data: CloseCashLinkArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        {
          pubkey: params.cashLink,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: params.feePayer, isSigner: false, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  initialize = async (input: InitializeCashLinkInput): Promise<ResultContext> => {
    const transaction = await this.initializeTransaction(input);
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    transaction.recentBlockhash = value.blockhash;
    transaction.lastValidBlockHeight = value.lastValidBlockHeight;
    transaction.feePayer = this.feePayer.publicKey;
    if (input.computeBudget) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    transaction.partialSign(this.feePayer, this.authority);
    return {
      transaction: transaction
        .serialize({
          requireAllSignatures: false,
        })
        .toString('base64'),
      slot: context.slot,
    };
  };

  initializeTransaction = async (input: InitializeCashLinkInput): Promise<Transaction> => {
    const owner = new PublicKey(input.wallet);
    const mint: PublicKey | null = input.mint ? new PublicKey(input.mint) : null;
    const passKey = new PublicKey(input.passKey);
    const [cashLink, cashLinkBump] = await CashProgram.findCashLinkAccount(passKey);
    const amount = new BN(input.amount);
    const fixedFee = new BN(input.fixedFee ?? 0);
    const feeToRedeem = new BN(input.feeToRedeem ?? 0);
    const feeBps = input.feeBps ?? 0;
    const maxNumRedemptions = input.maxNumRedemptions;
    const minAmount = input.minAmount ? new BN(input.minAmount) : undefined;
    const initParams: InitCashLinkParams = {
      mint,
      owner,
      cashLinkBump,
      cashLink,
      feeBps,
      fixedFee,
      feeToRedeem,
      maxNumRedemptions,
      minAmount,
      passKey,
      amount: amount,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
      distributionType: input.distributionType,
      fingerprintEnabled: input.fingerprintEnabled,
      numDaysToExpire: input.numDaysToExpire ?? 1,
    };

    const transaction = new Transaction();
    transaction.add(await this.initInstruction(initParams));
    return transaction;
  };

  initInstruction = async (params: InitCashLinkParams): Promise<TransactionInstruction> => {
    const {
      amount,
      feeBps,
      fixedFee,
      feeToRedeem,
      passKey,
      distributionType,
      owner,
      cashLinkBump,
      authority,
      cashLink,
      mint,
      maxNumRedemptions,
      minAmount,
      fingerprintEnabled,
      numDaysToExpire,
    } = params;
    const data = InitCashLinkArgs.serialize({
      amount,
      feeBps,
      fixedFee,
      feeToRedeem,
      cashLinkBump,
      distributionType,
      maxNumRedemptions,
      minAmount,
      fingerprintEnabled,
      numDaysToExpire,
    });
    const keys = [
      {
        pubkey: authority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: owner,
        isSigner: true,
        isWritable: !mint,
      },
      {
        pubkey: this.feePayer.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: cashLink,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: passKey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
    if (mint) {
      keys.push({
        pubkey: mint,
        isSigner: false,
        isWritable: false,
      });
      const vaultToken = await _findAssociatedTokenAddress(cashLink, mint);
      keys.push({
        pubkey: vaultToken,
        isSigner: false,
        isWritable: true,
      });
      const ownerToken = await _findAssociatedTokenAddress(owner, mint);
      keys.push({
        pubkey: ownerToken,
        isSigner: false,
        isWritable: true,
      });
      keys.push({
        pubkey: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      });
    }
    keys.push({
      pubkey: spl.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    });
    return new TransactionInstruction({
      keys,
      data,
      programId: CashProgram.PUBKEY,
    });
  };

  send = async (payload: string): Promise<string> => {
    const buffer = Buffer.from(payload, 'base64');
    const txIx = Transaction.from(buffer);
    if (!txIx.verifySignatures()) {
      throw Error(INVALID_SIGNATURE);
    }
    return this.connection.sendRawTransaction(buffer, {
      skipPreflight: false,
    });
  };

  confirmTransaction = async (
    signature: string,
    commitment: Commitment = 'confirmed',
  ): Promise<RpcResponseAndContext<SignatureResult>> => {
    const latestBlockhash = await this.connection.getLatestBlockhash(commitment);
    return await this.connection.confirmTransaction(
      {
        ...latestBlockhash,
        signature,
      },
      commitment,
    );
  };

  redeem = async (input: RedeemCashLinkInput): Promise<ResultContext> => {
    const transaction = await this.redeemTransaction(input);
    if (input.computeBudget) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget,
        }),
      );
    }
    if (input.computeUnitPrice) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeUnitPrice,
        }),
      );
    }
    const { context, value } = await this.connection.getLatestBlockhashAndContext(input.commitment);
    transaction.recentBlockhash = value.blockhash;
    transaction.lastValidBlockHeight = value.lastValidBlockHeight;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer, this.authority);
    return {
      transaction: transaction
        .serialize({
          requireAllSignatures: false,
        })
        .toString('base64'),
      slot: context.slot,
    };
  };

  redeemTransaction = async (input: RedeemCashLinkInput): Promise<Transaction> => {
    const passKey = new PublicKey(input.passKey);
    const [cashLinkAddress, cashLinkBump] = await CashProgram.findCashLinkAccount(passKey);
    const cashLink = await _getCashLinkAccount(this.connection, cashLinkAddress, input.commitment);
    if (cashLink == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const fingerprint = input.fingerprint;
    let fingerprintPda: PublicKey | undefined;
    let fingerprintBump: number | undefined;
    if (cashLink.data.fingerprintEnabled) {
      if (!fingerprint) {
        throw new Error(FINGERPRINT_NOT_FOUND);
      }
      [fingerprintPda, fingerprintBump] = await CashProgram.findFingerprintAccount(
        cashLinkAddress,
        input.fingerprint,
      );
    }
    const walletAddress = new PublicKey(input.walletAddress);
    const owner = new PublicKey(cashLink.data.owner);
    let accountKeys = [walletAddress, this.feeWallet, owner];
    let vaultToken: PublicKey | null = null;
    if (cashLink.data.mint) {
      const mint = new PublicKey(cashLink.data.mint);
      vaultToken = await _findAssociatedTokenAddress(cashLinkAddress, mint);
      accountKeys = (
        await Promise.all([
          spl.getOrCreateAssociatedTokenAccount(
            this.connection,
            this.feePayer,
            new PublicKey(cashLink.data.mint),
            accountKeys[0],
            true,
            input.commitment,
          ),
          spl.getOrCreateAssociatedTokenAccount(
            this.connection,
            this.feePayer,
            new PublicKey(cashLink.data.mint),
            accountKeys[1],
            true,
            input.commitment,
          ),
          spl.getOrCreateAssociatedTokenAccount(
            this.connection,
            this.feePayer,
            new PublicKey(cashLink.data.mint),
            accountKeys[2],
            true,
            input.commitment,
          ),
        ])
      ).map((acc) => acc.address);
    }
    const [redemption, redemptionBump] = await CashProgram.findRedemptionAccount(
      cashLinkAddress,
      walletAddress,
    );
    const redeemInstruction = await this.redeemInstruction({
      redemption,
      cashLinkBump,
      passKey,
      redemptionBump: redemptionBump,
      wallet: walletAddress,
      walletToken: accountKeys[0],
      feeToken: accountKeys[1],
      ownerToken: accountKeys[2],
      vaultToken,
      authority: this.authority.publicKey,
      cashLink: cashLink.pubkey,
      feePayer: this.feePayer.publicKey,
      fingerprint,
      fingerprintBump,
      fingerprintPda,
    });
    const transaction = new Transaction();
    transaction.add(redeemInstruction);
    return transaction;
  };

  redeemInstruction = async (params: RedeemCashLinkParams): Promise<TransactionInstruction> => {
    const keys = [
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.wallet, isSigner: false, isWritable: true },
      { pubkey: params.feeToken, isSigner: false, isWritable: true },
      { pubkey: params.cashLink, isSigner: false, isWritable: true },
      { pubkey: params.passKey, isSigner: true, isWritable: false },
      { pubkey: params.redemption, isSigner: false, isWritable: true },
      { pubkey: params.ownerToken, isSigner: false, isWritable: true },
      { pubkey: params.feePayer, isSigner: true, isWritable: false },
      {
        pubkey: SYSVAR_CLOCK_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_SLOT_HASHES_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
    if (params.vaultToken) {
      keys.push({ pubkey: params.walletToken, isSigner: false, isWritable: true });
      keys.push({
        pubkey: params.vaultToken,
        isSigner: false,
        isWritable: true,
      });
    }
    keys.push({
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    });
    if (params.fingerprintPda) {
      keys.push({
        pubkey: params.fingerprintPda,
        isSigner: false,
        isWritable: true,
      });
    }
    keys.push({
      pubkey: spl.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    });
    return new TransactionInstruction({
      keys,
      programId: CashProgram.PUBKEY,
      data: RedeemCashLinkArgs.serialize({
        cashLinkBump: params.cashLinkBump,
        redemptionBump: params.redemptionBump,
        fingerprintBump: params.fingerprintBump,
        fingerprint: params.fingerprint,
      }),
    });
  };

  signTransaction = (transaction: Transaction): Buffer => {
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer);
    return transaction.serialize();
  };

  getVault = async (
    cashLink: PublicKey,
    mint: PublicKey,
    commitment?: Commitment,
  ): Promise<spl.Account | null> => {
    try {
      const vault = await _findAssociatedTokenAddress(cashLink, mint);
      return await spl.getAccount(this.connection, vault, commitment);
    } catch (error: unknown) {
      if (
        error instanceof spl.TokenAccountNotFoundError ||
        error instanceof spl.TokenInvalidAccountOwnerError
      ) {
        return null;
      }
      throw error;
    }
  };

  getCashLink = async (address: PublicKey, commitment?: Commitment): Promise<CashLink | null> => {
    try {
      return await _getCashLinkAccount(this.connection, address, commitment);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
        return null;
      }
      throw error;
    }
  };

  getCashLinkRedemption = async (
    address: PublicKey,
    commitment?: Commitment,
  ): Promise<Redemption | null> => {
    try {
      return await _getCashLinkRedemptionAccount(this.connection, address, commitment);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
        return null;
      }
      throw error;
    }
  };
}

const _findAssociatedTokenAddress = (walletAddress: PublicKey, tokenMintAddress: PublicKey) =>
  spl.getAssociatedTokenAddressSync(tokenMintAddress, walletAddress, true);

const _getCashLinkAccount = async (
  connection: Connection,
  cashLinkAddress: PublicKey,
  commitment?: Commitment,
): Promise<CashLink | null> => {
  try {
    const accountInfo = await connection.getAccountInfo(cashLinkAddress, commitment);
    if (accountInfo === null) {
      return null;
    }
    const cashLink = CashLink.from(new Account(cashLinkAddress, accountInfo));
    return cashLink;
  } catch (error) {
    return null;
  }
};

const _getCashLinkRedemptionAccount = async (
  connection: Connection,
  cashLinkAddress: PublicKey,
  commitment?: Commitment,
): Promise<Redemption | null> => {
  try {
    const accountInfo = await connection.getAccountInfo(cashLinkAddress, commitment);
    if (accountInfo === null) {
      return null;
    }
    return Redemption.from(new Account(cashLinkAddress, accountInfo));
  } catch (error) {
    return null;
  }
};
