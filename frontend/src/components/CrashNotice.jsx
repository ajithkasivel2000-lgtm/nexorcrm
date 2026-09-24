/** Shown instead of a blank page when a screen crashes (see main.jsx). */
export default function CrashNotice() {
  return (
    <div role="alert" style={{ padding: 32, fontFamily: "system-ui, sans-serif", maxWidth: 520, margin: "10vh auto", textAlign: "center" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong on this screen</h1>
      <p style={{ color: "#64748b", marginBottom: 20 }}>Your data is safe. Reloading usually fixes it.</p>
      <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 18px", borderRadius: 8, border: 0, background: "#4F46E5", color: "#fff", cursor: "pointer" }}>Reload</button>
    </div>
  )
}
