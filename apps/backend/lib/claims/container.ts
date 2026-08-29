export interface ClaimView{chain:"solana"|"sui";vestingAddress:string;token:string;totalAtomic:string;claimedAtomic:string;claimableAtomic:string;schedule:string}
export interface ClaimsReader{list(wallet:string,chain:"solana"|"sui"):Promise<ClaimView[]>}
let reader:ClaimsReader|undefined;export function configureClaimsReader(next:ClaimsReader):void{reader=next}export function getClaimsReader():ClaimsReader{if(!reader)throw new Error("Claims chain reader is not configured.");return reader}
