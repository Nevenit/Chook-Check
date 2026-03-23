import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/db";
import { getSettings, updateSetting } from "@/lib/settings";
import { getStorageStats } from "@/lib/data";
import type { UserSettings } from "@/lib/types";
import { ContributionSection } from "./ContributionSection";
import { DataSummarySection } from "./DataSummarySection";
import { SharingLogSection } from "./SharingLogSection";
import { ConsentHistorySection } from "./ConsentHistorySection";
import { DataManagementSection } from "./DataManagementSection";
import { AboutSection } from "./AboutSection";
import styles from "./SettingsPage.module.css";

interface StorageStats {
  totalObservations: number;
  distinctProducts: number;
  newestDate: string | null;
}

const SECTIONS = [
  { id: "contribution", label: "Contribution" },
  { id: "data-summary", label: "Data Summary" },
  { id: "sharing-log", label: "Sharing Log" },
  { id: "consent-history", label: "Consent History" },
  { id: "data-management", label: "Data Management" },
  { id: "about", label: "About" },
] as const;

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [stats, setStats] = useState<StorageStats>({
    totalObservations: 0,
    distinctProducts: 0,
    newestDate: null,
  });
  const [activeSection, setActiveSection] = useState<string>("contribution");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const loadData = useCallback(async () => {
    const [s, st] = await Promise.all([getSettings(db), getStorageStats(db)]);
    setSettings(s);
    setStats({
      totalObservations: st.totalObservations,
      distinctProducts: st.distinctProducts,
      newestDate: st.newestDate,
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    for (const section of SECTIONS) {
      const el = sectionRefs.current[section.id];
      if (!el) continue;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(section.id);
          }
        },
        { threshold: 0.3 },
      );
      observer.observe(el);
      observers.push(observer);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [settings]);

  async function handleToggle(key: keyof UserSettings, value: boolean) {
    await updateSetting(db, key, value);
    const updated = await getSettings(db);
    setSettings(updated);
  }

  function handleNavClick(sectionId: string) {
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth" });
  }

  if (!settings) {
    return <p className={styles.loading}>Loading...</p>;
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTitle}>Chook Check</div>
        <nav role="navigation">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              className={`${styles.navLink} ${activeSection === section.id ? styles.navLinkActive : ""}`}
              onClick={() => handleNavClick(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.main}>
        <section
          id="contribution"
          className={styles.section}
          ref={(el) => { sectionRefs.current["contribution"] = el; }}
        >
          <h2 className={styles.sectionHeading}>Contribution</h2>
          <p className={styles.sectionDescription}>
            Help other Australians spot unfair pricing by sharing your price
            observations.
          </p>
          <ContributionSection settings={settings} onToggle={handleToggle} />
        </section>

        <section
          id="data-summary"
          className={styles.section}
          ref={(el) => { sectionRefs.current["data-summary"] = el; }}
        >
          <h2 className={styles.sectionHeading}>What's stored locally</h2>
          <p className={styles.sectionDescription}>
            All your data stays on your device unless you opt in to
            contributing.
          </p>
          <DataSummarySection stats={stats} />
        </section>

        <section
          id="sharing-log"
          className={styles.section}
          ref={(el) => { sectionRefs.current["sharing-log"] = el; }}
        >
          <h2 className={styles.sectionHeading}>Sharing log</h2>
          <p className={styles.sectionDescription}>
            A record of every batch of observations sent to the community API.
          </p>
          <SharingLogSection />
        </section>

        <section
          id="consent-history"
          className={styles.section}
          ref={(el) => { sectionRefs.current["consent-history"] = el; }}
        >
          <h2 className={styles.sectionHeading}>Consent history</h2>
          <p className={styles.sectionDescription}>
            Every change to your privacy settings is recorded here.
          </p>
          <ConsentHistorySection consentLog={settings.consentLog} />
        </section>

        <section
          id="data-management"
          className={styles.section}
          ref={(el) => { sectionRefs.current["data-management"] = el; }}
        >
          <h2 className={styles.sectionHeading}>Data management</h2>
          <p className={styles.sectionDescription}>
            Delete your data locally or request server-side deletion.
          </p>
          <DataManagementSection onDataDeleted={loadData} />
        </section>

        <section
          id="about"
          className={styles.section}
          ref={(el) => { sectionRefs.current["about"] = el; }}
        >
          <h2 className={styles.sectionHeading}>About</h2>
          <AboutSection />
        </section>
      </main>
    </div>
  );
}
