function KUEmblem({ size = 160, variant = 'light' }) {
  const isDark = variant === 'dark'
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: isDark
          ? 'drop-shadow(0 6px 16px rgba(0,0,0,0.4))'
          : 'drop-shadow(0 4px 12px rgba(13,61,24,0.25))',
      }}
    >
      <img
        src="/ku-seal.png"
        alt="ตรามหาวิทยาลัยเกษตรศาสตร์"
        width={size}
        height={size}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: isDark ? 'brightness(0) invert(1)' : 'none',
          display: 'block',
        }}
      />
    </div>
  )
}

export default KUEmblem
