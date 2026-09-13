import React from 'react'
import PatientWorkspace from './PatientWorkspace'

export default function PatientProfileView({ patientId, onBack }) {
  // PatientWorkspace uses useParams() to get the ID, which matches /patients/:id
  return <PatientWorkspace />
}
