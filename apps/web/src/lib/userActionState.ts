export type UnifiedActionState = 'Active' | 'Suspended' | 'Inconsistent' | 'Unknown';

export function isUnifiedActionDisabled(
  overall: UnifiedActionState,
  isHydrated: boolean,
): boolean {
  return !isHydrated || overall === 'Inconsistent' || overall === 'Unknown';
}
