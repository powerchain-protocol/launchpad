import type { ChainSettlementVerifier, CheckoutOrderRepository } from "./reconciliation";
import { reconcileCheckoutOrder } from "./reconciliation";
import type { D1CheckoutRepository } from "./d1-repository";

export interface CheckoutReconciliationService { reconcile(orderId: string): ReturnType<typeof reconcileCheckoutOrder> }
let reconciliationService: CheckoutReconciliationService | undefined;
let checkoutRepository: D1CheckoutRepository | undefined;

export function configureCheckoutRepository(repository: D1CheckoutRepository): void { checkoutRepository = repository; }
export function getCheckoutRepository(): D1CheckoutRepository { if (!checkoutRepository) throw new Error("Checkout repository is not configured."); return checkoutRepository; }
export function configureCheckoutReconciliation(deps: { repository: CheckoutOrderRepository; verifier: ChainSettlementVerifier }): void {
  reconciliationService = { reconcile: (orderId) => reconcileCheckoutOrder(orderId, deps.repository, deps.verifier) };
}
export function getCheckoutReconciliationService(): CheckoutReconciliationService {
  if (!reconciliationService) throw new Error("Checkout reconciliation is not configured with the production D1 repository and chain verifier.");
  return reconciliationService;
}
