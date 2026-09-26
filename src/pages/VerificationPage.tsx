import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDoctorLabel } from '../lib/professionalName'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { 
  UploadCloud, CheckCircle2, ShieldCheck, Zap, Lock, 
  MessageSquare, Loader2, X, FileText, ArrowRight, Shield 
} from 'lucide-react'

const VerificationPage: React.FC = () => {
  const navigate = useNavigate()
  const [verificationData, setVerificationData] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem('pending_verification') || '{}')
    if (!data.userId) {
      navigate('/login')
    } else {
      setVerificationData(data)
    }
  }, [navigate])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => setPreview(reader.result as string)
        reader.readAsDataURL(selectedFile)
      } else {
        setPreview(null)
      }
    }
  }

  const handleUpload = async () => {
    if (!file || !verificationData) return
    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `${verificationData.userId}/${Math.random()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('verifications')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { error: docError } = await supabase.from('documents').insert([{
        cabinet_id: verificationData.cabinetId,
        type_document: 'professionnel',
        storage_path: uploadData.path,
        nom_fichier: file.name
      }])

      if (docError) throw docError

      setSuccess(true)
      toast.success('Document envoyé ! Notre équipe va le valider.')
    } catch (err: any) {
      console.error('Upload error:', err)
      toast.error('Erreur lors de l\'envoi du document.')
    } finally {
      setUploading(false)
    }
  }

  if (!verificationData) return null

  return (
    <div className="min-h-screen animated-mesh-bg flex flex-col font-sans">
      {/* Premium Navbar */}
      <nav className="glass-card-morphism border-0 h-[80px] px-10 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-blue-600/20">M</div>
          <span className="text-2xl font-black tracking-tight text-slate-900">MacroMedica<span className="text-blue-600">.</span></span>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-full border border-amber-100">
          <Shield size={16} className="text-amber-600" />
          <span className="text-amber-700 text-xs font-black uppercase tracking-wider">Vérification en cours</span>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto w-full py-16 px-6">
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black text-slate-900 mb-6 tracking-tight"
          >
            Sécurisez votre cabinet
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-slate-500 max-w-2xl mx-auto font-medium"
          >
            MacroMedica est un espace exclusif aux professionnels de santé. 
            Vérifiez votre statut pour débloquer toutes les fonctionnalités.
          </motion.p>
        </div>

        {success ? (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-card-morphism p-16 text-center rounded-[48px] shadow-2xl border-white"
          >
            <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-4">Document reçu !</h2>
            <p className="text-slate-500 mb-10 text-lg font-medium max-w-md mx-auto leading-relaxed">
              Votre dossier est en haut de la pile. Validation estimée sous <span className="text-blue-600 font-bold">2 heures</span>.
            </p>
            <button 
              onClick={() => { window.location.href = '/dashboard' }}
              className="bg-slate-900 text-white rounded-2xl px-10 py-5 font-black text-lg hover:bg-slate-800 transition shadow-2xl shadow-slate-900/20 flex items-center gap-3 mx-auto"
            >
              Explorer mon Dashboard <ArrowRight size={24} />
            </button>
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 gap-10">
            {/* WhatsApp Option */}
            <motion.div 
              whileHover={{ y: -5 }}
              className="glass-card-morphism p-10 rounded-[40px] border-white shadow-xl flex flex-col group"
            >
              <div className="h-16 w-16 bg-emerald-100 rounded-3xl flex items-center justify-center text-emerald-600 mb-8 shadow-inner group-hover:scale-110 transition-transform">
                <MessageSquare size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-4">Validation Express</h3>
              <p className="text-slate-500 text-base font-medium leading-relaxed mb-10 flex-1">
                Envoyez une photo de votre carte professionnelle via WhatsApp. Notre équipe vous répondra instantanément.
              </p>
              <a 
                href={`https://wa.me/212600000000?text=Bonjour, je suis ${formatDoctorLabel(verificationData.nomComplet)}, je souhaite vérifier mon compte MacroMedica.`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-500 text-white text-center rounded-2xl py-5 font-black text-lg hover:bg-emerald-600 transition shadow-xl shadow-emerald-500/20 block"
              >
                VÉRIFIER PAR WHATSAPP
              </a>
            </motion.div>

            {/* Upload Option */}
            <motion.div 
              whileHover={{ y: -5 }}
              className="glass-card-morphism p-10 rounded-[40px] border-white shadow-xl flex flex-col group"
            >
              <div className="h-16 w-16 bg-blue-100 rounded-3xl flex items-center justify-center text-blue-600 mb-8 shadow-inner group-hover:scale-110 transition-transform">
                <UploadCloud size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-4">Téléversement direct</h3>
              
              <div className="flex-1 mb-8">
                {!file ? (
                  <div className="border-3 border-dashed border-slate-200 rounded-3xl p-10 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer relative overflow-hidden">
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                      onChange={handleFileChange}
                      accept=".jpg,.jpeg,.png,.pdf"
                    />
                    <UploadCloud size={40} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-lg font-black text-slate-700">Déposer un document</p>
                    <p className="text-sm text-slate-400 font-bold mt-2 uppercase tracking-tighter">Carte Pro, Diplôme ou CIN</p>
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-3xl p-6 relative border border-blue-100 flex items-center gap-5 shadow-inner">
                    <button onClick={() => {setFile(null); setPreview(null)}} className="absolute -top-3 -right-3 h-8 w-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 shadow-lg z-20">
                      <X size={18} />
                    </button>
                    {preview ? (
                      <img src={preview} alt="preview" className="h-20 w-20 object-cover rounded-2xl border-2 border-white shadow-md" />
                    ) : (
                      <div className="h-20 w-20 bg-white rounded-2xl border border-slate-100 flex items-center justify-center text-blue-500 shadow-md">
                        <FileText size={32} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-black text-slate-900 truncate">{file.name}</p>
                      <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full bg-blue-600 text-white rounded-2xl py-5 font-black text-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3"
              >
                {uploading ? <Loader2 className="animate-spin" size={24} /> : 'ENVOYER LE DOCUMENT'}
              </button>
            </motion.div>
          </div>
        )}

        {/* Skip for now */}
        {!success && (
          <div className="mt-12 text-center">
            <button 
              onClick={() => { window.location.href = '/dashboard' }}
              className="text-slate-400 hover:text-slate-900 text-sm font-black underline underline-offset-8 decoration-slate-200 uppercase tracking-widest"
            >
              Plus tard, accéder au dashboard →
            </button>
          </div>
        )}
      </main>

      <footer className="py-12 border-t border-slate-100 text-center">
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">© 2024 MacroMedica Excellence Médicale</p>
      </footer>
    </div>
  )
}

export default VerificationPage
