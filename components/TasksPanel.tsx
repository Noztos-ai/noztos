'use client'

export function TasksPanel({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sub-navbar — special options bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-5 py-1.5" style={{ backgroundColor: '#1e1e28' }}>
        {/* Placeholder for special option squares */}
      </div>

      {/* Main content: 4 columns (70%) + 1 column (30%) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left 70% — 4 equal columns */}
        <div className="flex w-[70%] border-r border-white/10">
          <div className="flex flex-1 flex-col border-r border-white/10 p-4" style={{ backgroundColor: '#111116' }}>
            {/* Column 1 */}
          </div>
          <div className="flex flex-1 flex-col border-r border-white/10 p-4" style={{ backgroundColor: '#111116' }}>
            {/* Column 2 */}
          </div>
          <div className="flex flex-1 flex-col border-r border-white/10 p-4" style={{ backgroundColor: '#111116' }}>
            {/* Column 3 */}
          </div>
          <div className="flex flex-1 flex-col p-4" style={{ backgroundColor: '#111116' }}>
            {/* Column 4 */}
          </div>
        </div>

        {/* Right 30% */}
        <div className="flex w-[30%] flex-col p-4" style={{ backgroundColor: '#0d0d12' }}>
          {/* Column 5 */}
        </div>
      </div>
    </div>
  )
}
