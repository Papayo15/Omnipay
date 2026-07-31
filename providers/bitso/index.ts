// providers/bitso/index.ts — re-exports

export { bitsoRequest, BitsoError }                             from "./client";
export type { BitsoWithdrawalParams, BitsoWithdrawal }          from "./withdrawals";
export { createWithdrawal, getWithdrawal }                      from "./withdrawals";
export type { BitsoClabe, BitsoDeposit }                        from "./clabes";
export { createClabe, getClabe, listClabes, listDeposits }      from "./clabes";
