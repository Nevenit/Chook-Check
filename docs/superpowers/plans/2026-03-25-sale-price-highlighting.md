# Sale Price Highlighting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually distinguish sale-price observations (amber) from regular-price observations (green) in the dashboard chart and overlay sparkline.

**Architecture:** An observation is "on sale" when `promoType !== null`. The Sparkline component gets a new `onSale` boolean array prop. The PriceChart uses per-point color arrays and Chart.js segment styling. OverlayPanel derives `onSale` from the `history` it already has.

**Tech Stack:** React, Chart.js, SVG, Vitest

---

## File Structure

**Modified files:**
- `components/overlay/Sparkline.tsx` — add `onSale` prop, render per-segment line colors and sale-point circles
- `components/overlay/sparkline.css` — remove hardcoded fill/stroke (now set inline per-segment)
- `components/overlay/OverlayPanel.tsx` — derive `onSale` from `history` and pass to Sparkline
- `components/dashboard/PriceChart.tsx` — per-point colors, segment styling, tooltip promo label
- `test/components/overlay/overlay.test.tsx` — add sparkline sale highlighting tests

---

### Task 1: Sparkline sale highlighting

**Files:**
- Modify: `components/overlay/Sparkline.tsx`
- Modify: `components/overlay/sparkline.css`
- Modify: `test/components/overlay/overlay.test.tsx`

- [ ] **Step 1: Add sparkline sale tests**

Add these tests after the existing `OverlayBadge` describe block at the end of `test/components/overlay/overlay.test.tsx`:

```typescript
describe("Sparkline", () => {
  it("renders all-green when onSale is not provided", () => {
    const { container } = render(<Sparkline prices={[300, 400, 500]} />);
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBe(2);
    lines.forEach((line) => {
      expect(line.getAttribute("stroke")).toBe("#16a34a");
    });
    // Only last-point dot
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
  });

  it("renders amber segments and dots for sale points", () => {
    const { container } = render(
      <Sparkline prices={[300, 400, 500]} onSale={[false, true, false]} />,
    );
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBe(2);
    // Segment to sale point is amber
    expect(lines[0].getAttribute("stroke")).toBe("#f59e0b");
    // Segment from sale point to regular is green
    expect(lines[1].getAttribute("stroke")).toBe("#16a34a");
    // Sale dot + last-point dot = 2 circles
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2);
    expect(circles[0].getAttribute("fill")).toBe("#f59e0b");
  });

  it("renders single sale point in amber", () => {
    const { container } = render(
      <Sparkline prices={[300]} onSale={[true]} />,
    );
    const circle = container.querySelector("circle");
    expect(circle?.getAttribute("fill")).toBe("#f59e0b");
  });

  it("renders single regular point in green", () => {
    const { container } = render(
      <Sparkline prices={[300]} onSale={[false]} />,
    );
    const circle = container.querySelector("circle");
    expect(circle?.getAttribute("fill")).toBe("#16a34a");
  });
});
```

Also add the Sparkline import at the top of the file (after the existing imports):

```typescript
import { Sparkline } from "../../../components/overlay/Sparkline";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/overlay/overlay.test.tsx`
Expected: FAIL — Sparkline still renders `<polyline>` not `<line>` elements.

- [ ] **Step 3: Update `components/overlay/Sparkline.tsx`**

Replace the full file. Note: `className="cc-sparkline-dot"` is removed from circles because the CSS rule `.cc-sparkline-dot { fill: #16a34a }` would override the inline `fill` attribute (CSS class > SVG presentation attribute). Colors are now fully inline.

```typescript
interface SparklineProps {
  prices: number[];
  onSale?: boolean[];
  width?: number;
  height?: number;
}

const GREEN = "#16a34a";
const AMBER = "#f59e0b";

export function Sparkline({
  prices,
  onSale,
  width = 200,
  height = 40,
}: SparklineProps) {
  if (prices.length === 0) return null;

  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  if (prices.length === 1) {
    const isSale = onSale?.[0] ?? false;
    return (
      <svg width={width} height={height} className="cc-sparkline">
        <circle
          cx={width / 2}
          cy={height / 2}
          r={3}
          fill={isSale ? AMBER : GREEN}
        />
      </svg>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const coords = prices.map((price, i) => ({
    x: padding + (i / (prices.length - 1)) * chartWidth,
    y: padding + chartHeight - ((price - min) / range) * chartHeight,
  }));

  return (
    <svg width={width} height={height} className="cc-sparkline">
      {coords.map((coord, i) => {
        if (i === 0) return null;
        const prev = coords[i - 1];
        const isSale = onSale?.[i] ?? false;
        return (
          <line
            key={`seg-${i}`}
            x1={prev.x}
            y1={prev.y}
            x2={coord.x}
            y2={coord.y}
            stroke={isSale ? AMBER : GREEN}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
      {coords.map((coord, i) => {
        const isSale = onSale?.[i] ?? false;
        const isLast = i === coords.length - 1;
        if (!isSale && !isLast) return null;
        return (
          <circle
            key={`dot-${i}`}
            cx={coord.x}
            cy={coord.y}
            r={3}
            fill={isSale ? AMBER : GREEN}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Update `components/overlay/sparkline.css`**

Remove the `.cc-sparkline-line` and `.cc-sparkline-dot` rules (colors are now set inline). Keep only the layout rule:

```css
.cc-sparkline {
  display: block;
  margin: 8px 0;
}
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/overlay/overlay.test.tsx`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/Chook_Check && git add components/overlay/Sparkline.tsx components/overlay/sparkline.css test/components/overlay/overlay.test.tsx && git commit -m "feat: highlight sale prices in sparkline with amber color"
```

---

### Task 2: Wire onSale through OverlayPanel

**Files:**
- Modify: `components/overlay/OverlayPanel.tsx`

- [ ] **Step 1: Update `components/overlay/OverlayPanel.tsx`**

Change line 26 from:

```typescript
  const prices = history.map((o) => o.priceCents);
```

to:

```typescript
  const prices = history.map((o) => o.priceCents);
  const onSale = history.map((o) => o.promoType !== null);
```

Change line 47 from:

```tsx
          <Sparkline prices={prices} />
```

to:

```tsx
          <Sparkline prices={prices} onSale={onSale} />
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/overlay/overlay.test.tsx`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/Chook_Check && git add components/overlay/OverlayPanel.tsx && git commit -m "feat: pass sale status from overlay panel to sparkline"
```

---

### Task 3: Dashboard PriceChart sale highlighting

**Files:**
- Modify: `components/dashboard/PriceChart.tsx`

- [ ] **Step 1: Update `components/dashboard/PriceChart.tsx`**

Replace the full file:

```typescript
import { useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import type { PriceObservation } from "@/lib/types";
import styles from "./PriceChart.module.css";

Chart.register(...registerables);

const GREEN = "#1a7a2e";
const GREEN_FILL = "rgba(26, 122, 46, 0.1)";
const AMBER = "#f59e0b";
const AMBER_FILL = "rgba(245, 158, 11, 0.15)";

interface PriceChartProps {
  observations: PriceObservation[];
}

export function PriceChart({ observations }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || observations.length === 0) return;

    const sorted = [...observations].sort((a, b) =>
      a.observedAt.localeCompare(b.observedAt),
    );

    const labels = sorted.map((o) =>
      new Date(o.observedAt).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
      }),
    );
    const data = sorted.map((o) => o.priceCents / 100);
    const isSale = sorted.map((o) => o.promoType !== null);

    const pointBackgroundColor = isSale.map((s) => (s ? AMBER : GREEN));
    const pointBorderColor = pointBackgroundColor;
    const pointRadius = isSale.map((s) => (s ? 4 : 3));

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Price ($)",
            data,
            borderColor: GREEN,
            backgroundColor: GREEN_FILL,
            fill: true,
            tension: 0.2,
            pointRadius,
            pointHoverRadius: 5,
            pointBackgroundColor,
            pointBorderColor,
            segment: {
              borderColor: (ctx) => {
                const p0Sale = isSale[ctx.p0DataIndex];
                const p1Sale = isSale[ctx.p1DataIndex];
                return p0Sale || p1Sale ? AMBER : GREEN;
              },
              backgroundColor: (ctx) => {
                const p0Sale = isSale[ctx.p0DataIndex];
                const p1Sale = isSale[ctx.p1DataIndex];
                return p0Sale || p1Sale ? AMBER_FILL : GREEN_FILL;
              },
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const price = `$${ctx.parsed.y?.toFixed(2) ?? "0.00"}`;
                const promo = sorted[ctx.dataIndex]?.promoType;
                return promo ? `${price} (${promo})` : price;
              },
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (val) => `$${(val as number).toFixed(2)}`,
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [observations]);

  if (observations.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} height={300} />
    </div>
  );
}
```

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/Chook_Check && git add components/dashboard/PriceChart.tsx && git commit -m "feat: highlight sale prices in dashboard chart with amber color"
```

---

## Post-implementation checklist

1. Run full test suite: `npx vitest run` — all tests pass
2. Build: `npx wxt build` — succeeds
3. Visual verification in browser:
   - Open dashboard → navigate to a product with sale history → chart shows amber points/segments for sale prices
   - Open overlay on a product page with sale history → sparkline shows amber dots for sale observations
   - Hover over an amber point in dashboard chart → tooltip shows promo type (e.g., "$3.50 (half_price)")
   - Products with no sale history → all green, no visual change
