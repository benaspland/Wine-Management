interface MessageModalProps {
  type: 'success' | 'error'
  text: string
  onClose: () => void
}

export default function MessageModal({ type, text, onClose }: MessageModalProps) {
  const isSuccess = type === 'success'
  const icon = isSuccess ? '✓' : '✕'
  const title = isSuccess ? 'Success' : 'Error'
  const color = isSuccess ? '#00DCFF' : '#FF6B6B'
  const borderColor = isSuccess ? 'border-l-[#00DCFF]' : 'border-l-[#FF6B6B]'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`bg-surface rounded-2xl shadow-lg p-8 max-w-md mx-4 border-l-4 ${borderColor}`}>
        <div className="flex items-start gap-4">
          <div className="text-3xl" style={{ color }}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="font-headline text-lg font-bold text-on-surface mb-2">
              {title}
            </h3>
            <p className="text-on-surface text-sm">{text}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-6 w-full bg-primary text-on-primary py-2.5 rounded-full font-medium hover:bg-primary/90 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  )
}
