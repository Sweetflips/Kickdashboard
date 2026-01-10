export const metadata = {
  title: 'Wheel Overlay',
}

export default function WheelOverlayLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ background: 'transparent', margin: 0, padding: 0, width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {children}
    </div>
  )
}
