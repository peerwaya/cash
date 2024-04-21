import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { CashLink } from './accounts';
import bs58 from 'bs58';

export class CashProgram extends Program {
  static readonly PREFIX = 'cash';
  static readonly FINGERPRINT_PREFIX = 'fingerprint';
  static readonly REDEMPTION_PREFIX = 'redeem';
  static readonly PUBKEY = new PublicKey('cashQKx31fVsquVKXQ9prKqVtSYf8SqcYt9Jyvg966q');

  static async findCashLinkAccount(passKey: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CashLink.PREFIX), passKey.toBuffer()],
      CashProgram.PUBKEY,
    );
  }

  static async findRedemptionAccount(
    cashLink: PublicKey,
    wallet: PublicKey,
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CashProgram.REDEMPTION_PREFIX), cashLink.toBuffer(), wallet.toBuffer()],
      CashProgram.PUBKEY,
    );
  }

  static async findFingerprintAccount(
    cashLink: PublicKey,
    fingerprint: string,
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CashProgram.FINGERPRINT_PREFIX), cashLink.toBuffer(), bs58.decode(fingerprint)],
      CashProgram.PUBKEY,
    );
  }
}
