import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingBanner } from "../../../components/popup/OnboardingBanner";

// Stub the WXT `browser` global used by the component
beforeAll(() => {
  vi.stubGlobal("browser", {
    runtime: {
      getURL: (path: string) => path,
    },
  });
});

describe("OnboardingBanner", () => {
  it("renders when conditions are met", () => {
    render(
      <OnboardingBanner
        distinctProducts={7}
        contributionEnabled={false}
        onboardingDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/7 products/)).toBeDefined();
    expect(screen.getByText(/Enable in settings/)).toBeDefined();
  });

  it("does not render when contribution is already enabled", () => {
    const { container } = render(
      <OnboardingBanner
        distinctProducts={7}
        contributionEnabled={true}
        onboardingDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("does not render when already dismissed", () => {
    const { container } = render(
      <OnboardingBanner
        distinctProducts={7}
        contributionEnabled={false}
        onboardingDismissed={true}
        onDismiss={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("does not render when fewer than 5 products", () => {
    const { container } = render(
      <OnboardingBanner
        distinctProducts={3}
        contributionEnabled={false}
        onboardingDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("calls onDismiss when dismiss button clicked", () => {
    const onDismiss = vi.fn();
    render(
      <OnboardingBanner
        distinctProducts={7}
        contributionEnabled={false}
        onboardingDismissed={false}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
