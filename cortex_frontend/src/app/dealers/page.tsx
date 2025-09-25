import PrintHeader from '@/components/PrintHeader';
import VehicleSelect from '@/components/VehicleSelect';
import DealerPanel from '@/components/DealerPanel';

export default function DealersPage() {
  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <PrintHeader />
      <div className="no-print">
        <VehicleSelect />
      </div>
      <DealerPanel />
    </main>
  );
}
