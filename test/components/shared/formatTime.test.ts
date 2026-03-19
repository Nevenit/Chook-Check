import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime } from "../../../components/shared/formatTime";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for timestamps under 60 seconds ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:00:30.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("just now");
  });

  it("returns minutes for timestamps under an hour ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:05:00.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("5 min ago");
  });

  it("returns hours for timestamps under a day ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T15:00:00.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("3 hr ago");
  });

  it("returns 'yesterday' for 1 day ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("yesterday");
  });

  it("returns days for older timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T12:00:00.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("5 days ago");
  });
});
