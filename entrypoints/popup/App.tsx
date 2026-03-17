export default function App() {
  return (
    <div className="popup">
      <header className="popup-header">
        <h1>Chook Check</h1>
        <p className="tagline">Supermarket price tracker</p>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat-value">0</span>
          <span className="stat-label">Products tracked</span>
        </div>
        <div className="stat">
          <span className="stat-value">0</span>
          <span className="stat-label">Prices recorded</span>
        </div>
      </section>

      <section className="status">
        <p>Not contributing — data stays on your device.</p>
      </section>

      <nav className="links">
        <a href={browser.runtime.getURL("/dashboard.html")}>Dashboard</a>
        <a href={browser.runtime.getURL("/options.html")}>Settings</a>
      </nav>
    </div>
  );
}
