import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export type InitCancelArgs = {
  cashLinkBump: number;
};

export class CancelCashLinkArgs extends Borsh.Data<InitCancelArgs> {
  static readonly SCHEMA = CancelCashLinkArgs.struct([
    ['instruction', 'u8'],
    ['cashLinkBump', 'u8'],
  ]);
  instruction = 2;
  cashLinkBump: number;
}

export type CancelCashLinkParams = {
  authority: PublicKey;
  cashLink: PublicKey;
  ownerToken: PublicKey;
  passKey: PublicKey;
  vaultToken?: PublicKey | null;
  feePayer: PublicKey;
  cashLinkBump: number;
};
