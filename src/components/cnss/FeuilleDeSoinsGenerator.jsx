import React, { useState } from 'react'
import { FileText, Download, RefreshCw } from 'lucide-react'
import { generateFSE } from './generateFSE'

export default function FeuilleDeSoinsGenerator() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState(null)
  const [isDebugMode, setIsDebugMode] = useState(false)

  // Sample database objects matching MacroMedica schema
  const mockPatient = {
    first_name: 'Meryem',
    last_name: 'TAZI',
    cnss_number: '123456789',
    cin: 'AB88419',
    address: 'Casablanca, Maroc',
    date_of_birth: '14/05/1998',
    gender: 'F',
  }

  const mockDoctor = {
    name: 'Dr. Othmane Touggani',
    specialty: 'Médecine Générale',
    inpe_code: '191023456',
    city: 'Casablanca',
    etablissement: 'Cabinet Médical Touggani',
  }

  const mockConsultation = {
    price: '150.00',
    date: new Date().toLocaleDateString('fr-FR'),
  }

  const handleGenerate = async (debug = isDebugMode) => {
    setIsGenerating(true)
    try {
      const url = await generateFSE(mockPatient, mockDoctor, mockConsultation, { debug })
      if (url) setGeneratedPdfUrl(url)
    } catch (err) {
      console.error('Error generating FSE:', err)
      alert('Erreur lors de la génération de la Feuille de Soins.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="p-6 border border-gray-200 rounded-2xl bg-white shadow-sm space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold">
            <FileText size={22} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">Génération Feuille de Soins CNSS</h3>
            <p className="text-xs text-gray-500 font-medium">
              Génération automatique sur modèle officiel (FSE_VIERGE1) avec calibration millimétrique des zones de saisie.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer select-none bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition">
            <input
              type="checkbox"
              checked={isDebugMode}
              onChange={(e) => {
                const val = e.target.checked
                setIsDebugMode(val)
                if (generatedPdfUrl) handleGenerate(val)
              }}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Mode Repères (Debug)</span>
          </label>

          <button
            onClick={() => handleGenerate(isDebugMode)}
            disabled={isGenerating}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isGenerating ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            <span>{isGenerating ? 'Génération en cours...' : 'Imprimer Feuille de Soins (PDF)'}</span>
          </button>
        </div>
      </div>

      {generatedPdfUrl && (
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-700">Aperçu en direct de la Feuille de Soins générée :</p>
            <a href={generatedPdfUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline font-semibold">
              Ouvrir le PDF plein écran
            </a>
          </div>
          <iframe
            src={generatedPdfUrl}
            title="CNSS PDF Official Preview"
            className="w-full h-[520px] rounded-xl border border-gray-300 shadow-inner"
          />
        </div>
      )}
    </div>
  )
}
