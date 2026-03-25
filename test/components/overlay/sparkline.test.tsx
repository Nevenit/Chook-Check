import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "../../../components/overlay/Sparkline";

describe("Sparkline", () => {
  it("renders nothing for empty prices", () => {
    const { container } = render(<Sparkline prices={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a dot for a single price point", () => {
    const { container } = render(<Sparkline prices={[350]} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("circle")).not.toBeNull();
    expect(svg!.querySelector("polyline")).toBeNull();
  });

  it("renders line segments for multiple price points", () => {
    const { container } = render(<Sparkline prices={[300, 350, 320, 400]} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll("line").length).toBe(3);
  });

  it("highlights the last point with a dot", () => {
    const { container } = render(<Sparkline prices={[300, 350, 320]} />);
    const svg = container.querySelector("svg");
    expect(svg!.querySelector("circle")).not.toBeNull();
  });

  it("handles all same prices (flat line)", () => {
    const { container } = render(<Sparkline prices={[400, 400, 400]} />);
    expect(container.querySelectorAll("line").length).toBe(2);
  });
});
