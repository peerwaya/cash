import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
export class CloseCashLinkArgs extends Borsh.Data {
  static readonly SCHEMA = CloseCashLinkArgs.struct([['instruction', 'u8']]);

  instruction = 3;
}

export type CloseCashLinkParams = {
  authority: PublicKey;
  cashLink: PublicKey;
  feePayer: PublicKey;
};
