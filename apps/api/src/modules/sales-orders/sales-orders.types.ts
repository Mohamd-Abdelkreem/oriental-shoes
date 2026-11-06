export type P04ReturnProof = Readonly<{
  orderId: string;
  decisionId: string;
  orderVersion: number;
  reason: string;
  returnedAt: Date;
}>;
