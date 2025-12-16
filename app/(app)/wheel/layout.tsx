export default function WheelOverlayLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ background: 'transparent', minHeight: '100vh' }}>
      {children}
    </div>
  )
}

