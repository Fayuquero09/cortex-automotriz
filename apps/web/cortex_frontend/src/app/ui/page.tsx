import Dashboard from '@/components/Dashboard'
import PrintHeader from '@/components/PrintHeader'
import VehicleSelect from '@/components/VehicleSelect'
import FiltersPanel from '@/components/FiltersPanel'
import ComparePanel from '@/components/ComparePanel'

export default function Page() {
  return (
    <main style={{ display:'grid', gap:16 }}>
      {/* Encabezado solo para PDF */}
      <PrintHeader />
      <Dashboard />
      {/* Los controles (marca/modelo/filtros) no se imprimen */}
      <div className="no-print"><VehicleSelect /></div>
      <div className="no-print"><FiltersPanel /></div>
      <ComparePanel />
    </main>
  )
}
