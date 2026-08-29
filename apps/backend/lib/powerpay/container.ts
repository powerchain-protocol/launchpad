import { getSolanaReadService } from "../solana/container";
import { PowerPayReadService } from "./service";

let service: PowerPayReadService | undefined;

export function configurePowerPayReadService(next: PowerPayReadService): void { service = next; }
export function getPowerPayReadService(): PowerPayReadService {
  if (!service) service = new PowerPayReadService(getSolanaReadService());
  return service;
}
export function resetPowerPayReadServiceForTests(): void { service = undefined; }
