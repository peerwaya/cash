import {
  Borsh,
  AnyPublicKey,
  ERROR_INVALID_OWNER,
  Account,
  StringPublicKey,
} from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';
import { AccountInfo, Commitment, Connection, PublicKey } from '@solana/web3.js';
import { CashProgram } from '../cash_program';
import { AccountType } from './account';
import BN from 'bn.js';

export const MAX_REDEMPTION_DATA_LEN = 81;

export type RedemptionDataArgs = {
  accountType: AccountType;
  cashLink: StringPublicKey;
  wallet: StringPublicKey;
  redeemedAt: BN;
  amount: BN;
};

export class RedemptionData extends Borsh.Data<RedemptionDataArgs> {
  static readonly SCHEMA = RedemptionData.struct([
    ['accountType', 'u8'],
    ['cashLink', 'pubkeyAsString'],
    ['wallet', 'pubkeyAsString'],
    ['redeemedAt', 'u64'],
    ['amount', 'u64'],
  ]);
  accountType: AccountType;
  cashLink: StringPublicKey;
  wallet: StringPublicKey;
  redeemedAt: BN;
  amount: BN;

  constructor(args: RedemptionDataArgs) {
    super(args);
  }
}

export class Redemption extends Account<RedemptionData> {
  static readonly PREFIX = 'redeem';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = RedemptionData.deserialize(this.info.data);
    if (!this.assertOwner(CashProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(cashLink: PublicKey, wallet: PublicKey) {
    const [pubKey] = await CashProgram.findRedemptionAccount(cashLink, wallet);
    return pubKey;
  }

  static async findMany(
    connection: Connection,
    filters: {
      cashLink?: AnyPublicKey;
      wallet?: AnyPublicKey;
    } = {},
    commitment?: Commitment,
  ) {
    const baseFilters = [
      // Filter for Redemption by account type
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from([AccountType.Redemption])),
        },
      },
      // Filter for assigned to authority
      filters.cashLink && {
        memcmp: {
          offset: 1,
          bytes: new PublicKey(filters.cashLink).toBase58(),
        },
      },
      // Filter for assigned to mint
      filters.wallet && {
        memcmp: {
          offset: 33,
          bytes: new PublicKey(filters.wallet).toBase58(),
        },
      },
    ].filter(Boolean);

    return (
      await CashProgram.getProgramAccounts(connection, {
        filters: baseFilters,
        commitment: commitment,
      })
    ).map((account) => Redemption.from(account));
  }
}
