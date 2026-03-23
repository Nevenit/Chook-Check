import { useState } from "react";
import styles from "./DashboardLayout.module.css";
import { OverviewView } from "./OverviewView";
import { ProductsView } from "./ProductsView";
import { ProductDetailView } from "./ProductDetailView";
import { ExportView } from "./ExportView";

type Tab = "overview" | "products" | "export";

export function DashboardLayout() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "products", label: "Products" },
    { id: "export", label: "Export" },
  ];

  function handleSelectProduct(productId: string) {
    setSelectedProductId(productId);
    setActiveTab("products");
  }

  function handleBackToProducts() {
    setSelectedProductId(null);
  }

  return (
    <div>
      <header className={styles.header}>
        <h1 className={styles.title}>Chook Check</h1>
        <p className={styles.subtitle}>Price tracking dashboard</p>
      </header>

      <nav className={styles.tabBar} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={activeTab === t.id ? styles.tabActive : styles.tab}
            onClick={() => {
              setActiveTab(t.id);
              if (t.id !== "products") setSelectedProductId(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {activeTab === "overview" && (
          <OverviewView onSelectProduct={handleSelectProduct} />
        )}
        {activeTab === "products" && !selectedProductId && (
          <ProductsView onSelectProduct={handleSelectProduct} />
        )}
        {activeTab === "products" && selectedProductId && (
          <ProductDetailView
            productId={selectedProductId}
            onBack={handleBackToProducts}
          />
        )}
        {activeTab === "export" && <ExportView />}
      </div>
    </div>
  );
}
