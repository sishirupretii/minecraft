export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#111',
      color: '#fff',
      fontFamily: "'Press Start 2P', monospace",
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>404</h1>
      <p style={{ fontSize: '12px', color: '#888' }}>Block not found</p>
      <a href="/" style={{ marginTop: '24px', color: '#4de8e0', fontSize: '10px' }}>
        Return to BaseCraft
      </a>
    </div>
  );
}
