import type { ChookCheckDB } from "./db";

export async function deleteOlderThan(
  db: ChookCheckDB,
  days: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.priceObservations
    .where("observedAt")
    .below(cutoff.toISOString())
    .delete();
}

export async function deleteProduct(
  db: ChookCheckDB,
  productId: string,
): Promise<number> {
  return db.priceObservations
    .where("productId")
    .equals(productId)
    .delete();
}

export async function deleteAll(db: ChookCheckDB): Promise<void> {
  await db.priceObservations.clear();
}
