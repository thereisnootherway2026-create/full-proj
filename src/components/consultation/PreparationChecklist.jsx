import { useState, useEffect } from 'react'
import { Plus, Check, X, Loader2, MoreHorizontal, CheckCircle2, Circle } from 'lucide-react'
import { getPreparationItems, addPreparationItem, updatePreparationItemStatus } from '../../lib/preparationService'
import { useAppContext } from '../../context/AppContext'

export default function PreparationChecklist({ visitId, mode = 'prepare' }) {
  const { currentClinic } = useAppContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [newItemText, setNewItemText] = useState('')
  const [adding, setAdding] = useState(false)
  const [isAddingMode, setIsAddingMode] = useState(false)

  const loadItems = async () => {
    if (!visitId) return
    setLoading(true)
    const data = await getPreparationItems(visitId)
    setItems(data)
    setLoading(false)
  }

  useEffect(() => {
    loadItems()
  }, [visitId])

  const handleAdd = async () => {
    if (!newItemText.trim() || !currentClinic?.id) return
    setAdding(true)
    try {
      const item = await addPreparationItem(currentClinic.id, visitId, newItemText.trim())
      if (item) {
        setItems(prev => [...prev, item])
        setNewItemText('')
        setIsAddingMode(false)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAdding(false)
    }
  }

  const handleUpdateStatus = async (itemId, status) => {
    // Optimistic update
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, status } : item))
    try {
      await updatePreparationItemStatus(itemId, status)
    } catch (err) {
      // Revert on error
      loadItems()
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (mode === 'prepare') {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
        <p className="text-[11px] text-slate-400 uppercase tracking-[0.12em] mb-3 font-semibold pl-1">
          Préparer la consultation
        </p>
        
        <div className="space-y-2 mb-3">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-2.5 px-2 py-1.5 rounded bg-slate-50 border border-slate-100">
              <div className="mt-0.5">
                {item.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : item.status === 'dismissed' ? (
                  <X className="w-4 h-4 text-slate-400" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <span className={`text-[13px] leading-tight ${item.status === 'dismissed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                {item.text}
              </span>
            </div>
          ))}
          {items.length === 0 && !isAddingMode && (
            <p className="text-xs text-slate-400 italic px-2">Aucun élément ajouté.</p>
          )}
        </div>

        {isAddingMode ? (
          <div className="space-y-2 mt-3">
            <input
              type="text"
              autoFocus
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setIsAddingMode(false); setNewItemText(''); }
              }}
              placeholder="Ex: Vérifier la tension..."
              className="w-full text-[13px] rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow"
            />
            <div className="flex gap-2 justify-end">
              <button 
                onClick={() => { setIsAddingMode(false); setNewItemText(''); }}
                className="px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={handleAdd}
                disabled={adding || !newItemText.trim()}
                className="px-3 py-1.5 text-[12px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Ajouter
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingMode(true)}
            className="w-full py-2 flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 rounded-lg transition-colors border border-blue-100"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter un élément
          </button>
        )}
      </div>
    )
  }

  // mode === 'consultation'
  if (items.length === 0) return null;

  return (
    <div className="bg-amber-50/50 rounded-2xl p-4 shadow-sm border border-amber-200/60 mb-5">
      <p className="text-[11px] text-amber-700/70 uppercase tracking-[0.12em] mb-3 font-semibold pl-1 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" />
        À vérifier
      </p>
      <div className="space-y-1">
        {items.map(item => {
          const isCompleted = item.status === 'completed';
          const isDismissed = item.status === 'dismissed';
          
          return (
            <div 
              key={item.id} 
              className={`flex items-start gap-3 p-2 rounded-lg transition-colors group ${
                isCompleted ? 'bg-emerald-50/50' : isDismissed ? 'opacity-50 grayscale' : 'hover:bg-white'
              }`}
            >
              <button 
                onClick={() => handleUpdateStatus(item.id, isCompleted ? 'pending' : 'completed')}
                className="mt-0.5 shrink-0 transition-colors outline-none"
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Circle className={`w-5 h-5 ${isDismissed ? 'text-slate-300' : 'text-amber-300 hover:text-amber-400'}`} />
                )}
              </button>
              
              <div className="flex-1 min-w-0">
                <span className={`text-[13.5px] font-medium block leading-snug pt-0.5 ${
                  isCompleted ? 'text-emerald-700 line-through decoration-emerald-300/50' : 
                  isDismissed ? 'text-slate-500 line-through' : 
                  'text-slate-700'
                }`}>
                  {item.text}
                </span>
              </div>
              
              {!isCompleted && !isDismissed && (
                <div className="relative flex items-center">
                  <button 
                    onClick={() => handleUpdateStatus(item.id, 'dismissed')}
                    className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                    title="Marquer comme non pertinent"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
