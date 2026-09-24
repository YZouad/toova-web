import { featureFlag, useEntitlements } from '../hooks/useEntitlements';
import { Gate } from '../ui/kit/Gate';
import type { ReactNode } from 'react';

/** Studio-only AR / USDZ entitlement gate. */
export function ArExportGate({ children }: { children: ReactNode }) {
  const { entitlements } = useEntitlements();
  const allowed = featureFlag(entitlements, 'ar_usdz_export');
  return (
    <Gate
      allowed={allowed}
      limitType="ar_export"
      title="AR export is Studio"
      message="Upgrade to Studio to export USDZ models for AR on your phone."
    >
      {children}
    </Gate>
  );
}

export function useCanExportUsdz(): boolean {
  const { entitlements } = useEntitlements();
  return featureFlag(entitlements, 'ar_usdz_export');
}
