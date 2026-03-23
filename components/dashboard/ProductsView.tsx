import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/db";
import {
  getAllProductSummaries,
  type ProductSummary,
} from "@/lib/data-dashboard";
import { formatPrice } from "@/components/shared/formatPrice";
import { formatRelativeTime } from "@/components/shared/formatTime";
import styles from "./ProductsView.module.css";

type SortKey = "name" | "chain" | "price" | "change" | "count" | "lastSeen";
type SortDir = "asc" | "desc";

interface ProductsViewProps {
  onSelectProduct: (productId: string) => void;
}

export function ProductsView({ onSelectProduct }: ProductsViewProps) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastSeen");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    getAllProductSummaries(db)
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? products.filter((p) => p.productName.toLowerCase().includes(q))
      : products;
  }, [products, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.productName.localeCompare(b.productName);
          break;
        case "chain":
          cmp = a.storeChain.localeCompare(b.storeChain);
          break;
        case "price":
          cmp = a.latestPriceCents - b.latestPriceCents;
          break;
        case "change": {
          const ac = a.previousPriceCents != null ? a.latestPriceCents - a.previousPriceCents : 0;
          const bc = b.previousPriceCents != null ? b.latestPriceCents - b.previousPriceCents : 0;
          cmp = ac - bc;
          break;
        }
        case "count":
          cmp = a.observationCount - b.observationCount;
          break;
        case "lastSeen":
          cmp = a.lastObservedAt.localeCompare(b.lastObservedAt);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "chain" ? "asc" : "desc");
    }
  }

  function renderSortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return (
      <span className={styles.sortIndicator}>
        {sortDir === "asc" ? "\u25B2" : "\u25BC"}
      </span>
    );
  }

  if (loading) return <p className={styles.loading}>Loading...</p>;

  return (
    <div>
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {sorted.length === 0 ? (
        <p className={styles.emptyState}>
          {search ? "No products match your search." : "No products tracked yet."}
        </p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th onClick={() => handleSort("name")}>Product{renderSortIndicator("name")}</th>
              <th onClick={() => handleSort("chain")}>Chain{renderSortIndicator("chain")}</th>
              <th onClick={() => handleSort("price")}>Price{renderSortIndicator("price")}</th>
              <th onClick={() => handleSort("change")}>Change{renderSortIndicator("change")}</th>
              <th onClick={() => handleSort("count")}>Obs{renderSortIndicator("count")}</th>
              <th onClick={() => handleSort("lastSeen")}>Last Seen{renderSortIndicator("lastSeen")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const changeCents = p.previousPriceCents != null
                ? p.latestPriceCents - p.previousPriceCents
                : null;
              return (
                <tr
                  key={p.productId}
                  className={styles.row}
                  onClick={() => onSelectProduct(p.productId)}
                >
                  <td>{p.productName}</td>
                  <td>
                    <span className={styles.chain}>{p.storeChain}</span>
                  </td>
                  <td>{formatPrice(p.latestPriceCents)}</td>
                  <td>
                    {changeCents == null || changeCents === 0 ? (
                      <span className={styles.changeNone}>—</span>
                    ) : changeCents > 0 ? (
                      <span className={styles.changeUp}>+{formatPrice(changeCents)}</span>
                    ) : (
                      <span className={styles.changeDown}>-{formatPrice(Math.abs(changeCents))}</span>
                    )}
                  </td>
                  <td>{p.observationCount}</td>
                  <td>{formatRelativeTime(p.lastObservedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
