
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

function Modal({ open, title, description, children, footer, onClose, width = 'max-w-md', noScroll = false, zIndex = 'z-[120]' }) {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="modal-backdrop"
          className={`fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center ${zIndex}`}
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.24, ease: 'easeOut' }}
        >
          <motion.div
            className={`bg-white relative w-full rounded-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] overflow-hidden ${width} flex flex-col ${noScroll ? '' : 'max-h-[85vh]'}`}
            onMouseDown={(event) => event.stopPropagation()}
            style={{ willChange: 'transform, opacity' }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
            // Ease-out-expo: fast start, long soft landing — no spring overshoot.
            transition={reduceMotion ? { duration: 0.12 } : { duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          >
            {(title || description) ? (
              <div className="px-5 py-4 flex items-center justify-between border-b border-[#F3F4F6] flex-shrink-0">
                <div>
                  {title ? <h2 className="text-[#111827] font-semibold text-[17px]">{title}</h2> : null}
                  {description ? <p className="text-slate-600 font-medium text-sm mt-1">{description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-[8px] border-none bg-transparent text-[#9CA3AF] cursor-pointer flex items-center justify-center transition-all hover:bg-[#F3F4F6] hover:text-[#374151]"
                >
                  <X className="w-[18px] h-[18px]" />
                </button>
              </div>
            ) : null}
            <div className={`${noScroll ? 'px-5 py-5' : 'flex-1 overflow-y-auto px-6 py-4'}`}>
              {children}
            </div>
            {footer ? (
              <div className="flex-shrink-0 px-5 py-4 border-t border-[#F3F4F6] bg-white">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export default Modal
